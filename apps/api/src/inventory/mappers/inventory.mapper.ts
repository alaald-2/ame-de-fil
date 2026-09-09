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

// Admin-facing display name resolves to the default locale (sv-SE), falling
// back to whatever translation exists — this is an internal admin tool
// showing "which product is this," not a customer-facing localized page,
// so it doesn't need a `locale` query param the way catalog does.
function resolveDisplayName(item: InventoryItemWithContext): string {
  const translations = item.variant.product.translations;
  const preferred = translations.find((t) => t.locale === Locale.sv_SE);
  return (preferred ?? translations[0])?.name ?? item.variant.sku;
}

export function mapInventoryItem(item: InventoryItemWithContext) {
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
