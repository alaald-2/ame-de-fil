import { Locale, type Prisma } from "@ame-de-fil/database";
import { computeAvailability } from "../../common/inventory-availability.ts";

export type InventoryItemWithContext = Prisma.InventoryItemGetPayload<{
  include: {
    variant: { include: { product: { include: { translations: true } } } };
  };
}>;

export type InventoryItemWithMovements = InventoryItemWithContext & {
  movements: Prisma.InventoryMovementGetPayload<Record<string, never>>[];
};

// The minimal shape mapInventoryItem actually reads — deliberately narrower
// than InventoryItemWithContext (above), which carries every scalar column
// at every nested level only because `include` can't restrict them. Both
// `list()`'s include-based rows and LOW_STOCK_ITEM_SELECT's select-based
// rows below structurally satisfy this, so one mapper serves both without
// either query having to over-fetch just to match the other's type.
interface MappableInventoryItem {
  onHand: number;
  reserved: number;
  tracksStock: boolean;
  isLimitedEdition: boolean;
  productionTimeDays: number | null;
  lowStockThreshold: number | null;
  variant: {
    id: string;
    sku: string;
    product: { translations: { locale: Locale; name: string }[] };
  };
}

// An explicit `select` — unlike list()'s `include` above — since this is
// only ever the second half of InventoryService.listLowStock's two-step
// query (raw SQL finds matching ids first; Prisma's declarative `where`
// can't express "onHand - reserved < lowStockThreshold," a column-to-
// column comparison), and only needs exactly what MappableInventoryItem
// reads, not every InventoryItem/ProductVariant/Product column.
export const LOW_STOCK_ITEM_SELECT = {
  id: true,
  onHand: true,
  reserved: true,
  tracksStock: true,
  isLimitedEdition: true,
  productionTimeDays: true,
  lowStockThreshold: true,
  variant: {
    select: {
      id: true,
      sku: true,
      product: { select: { translations: { select: { locale: true, name: true } } } },
    },
  },
} satisfies Prisma.InventoryItemSelect;

// Admin-facing display name resolves to the default locale (sv-SE), falling
// back to whatever translation exists — this is an internal admin tool
// showing "which product is this," not a customer-facing localized page,
// so it doesn't need a `locale` query param the way catalog does.
function resolveDisplayName(item: MappableInventoryItem): string {
  const translations = item.variant.product.translations;
  const preferred = translations.find((t) => t.locale === Locale.sv_SE);
  return (preferred ?? translations[0])?.name ?? item.variant.sku;
}

export function mapInventoryItem(item: MappableInventoryItem) {
  const { available, availableQuantity } = computeAvailability(item);
  return {
    variantId: item.variant.id,
    sku: item.variant.sku,
    productName: resolveDisplayName(item),
    onHand: item.onHand,
    reserved: item.reserved,
    available,
    availableQuantity,
    tracksStock: item.tracksStock,
    isLimitedEdition: item.isLimitedEdition,
    productionTimeDays: item.productionTimeDays,
    lowStockThreshold: item.lowStockThreshold,
  };
}

export function mapInventoryItemWithMovements(item: InventoryItemWithMovements) {
  return {
    ...mapInventoryItem(item),
    movements: item.movements.map((movement) => ({
      id: movement.id,
      type: movement.type,
      quantity: movement.quantity,
      reason: movement.reason,
      createdByUserId: movement.createdByUserId,
      createdAt: movement.createdAt.toISOString(),
    })),
  };
}
