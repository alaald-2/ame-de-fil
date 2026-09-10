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
// so it doesn't need a `locale` query param the way catalog does. Takes
// the variant directly (not the whole item) so the reservation/movement
// mappers below — which never fetch a full InventoryItem, only its variant
// via a nested select — can reuse the identical resolution rule rather
// than duplicating it a third time.
function resolveVariantDisplayName(variant: {
  sku: string;
  product: { translations: { locale: Locale; name: string }[] };
}): string {
  const translations = variant.product.translations;
  const preferred = translations.find((t) => t.locale === Locale.sv_SE);
  return (preferred ?? translations[0])?.name ?? variant.sku;
}

function resolveDisplayName(item: MappableInventoryItem): string {
  return resolveVariantDisplayName(item.variant);
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

// GET /admin/inventory/reservations (inventory-views checkpoint) — never a
// customer name/email/address, just enough (orderId/orderNumber) to
// cross-reference GET /admin/orders/:id if an admin needs the full order.
export const RESERVATION_LIST_SELECT = {
  id: true,
  status: true,
  quantity: true,
  expiresAt: true,
  createdAt: true,
  inventoryItem: {
    select: {
      variant: {
        select: {
          id: true,
          sku: true,
          product: { select: { translations: { select: { locale: true, name: true } } } },
        },
      },
    },
  },
  orderItem: {
    select: { order: { select: { id: true, orderNumber: true } } },
  },
} satisfies Prisma.StockReservationSelect;

export type ReservationListRow = Prisma.StockReservationGetPayload<{
  select: typeof RESERVATION_LIST_SELECT;
}>;

export function mapReservationListItem(row: ReservationListRow) {
  const variant = row.inventoryItem.variant;
  return {
    id: row.id,
    status: row.status,
    quantity: row.quantity,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    variantId: variant.id,
    sku: variant.sku,
    productName: resolveVariantDisplayName(variant),
    orderId: row.orderItem.order.id,
    orderNumber: row.orderItem.order.orderNumber,
  };
}

// GET /admin/inventory/movements (inventory-views checkpoint) — createdBy
// resolved to {id, email} only (mirrors admin-audit-log's own actor
// resolution, never a bare include of the full User row), nullable for a
// system-driven movement (SALE, no admin actor) or a since-deleted admin
// (onDelete: SetNull). orderId/orderNumber nullable the same way, via
// relatedOrderItem's own onDelete: SetNull.
export const MOVEMENT_LEDGER_SELECT = {
  id: true,
  type: true,
  quantity: true,
  reason: true,
  createdAt: true,
  inventoryItem: {
    select: {
      variant: {
        select: {
          id: true,
          sku: true,
          product: { select: { translations: { select: { locale: true, name: true } } } },
        },
      },
    },
  },
  createdBy: { select: { id: true, email: true } },
  relatedOrderItem: {
    select: { order: { select: { id: true, orderNumber: true } } },
  },
} satisfies Prisma.InventoryMovementSelect;

export type MovementLedgerRow = Prisma.InventoryMovementGetPayload<{
  select: typeof MOVEMENT_LEDGER_SELECT;
}>;

export function mapMovementLedgerItem(row: MovementLedgerRow) {
  const variant = row.inventoryItem.variant;
  return {
    id: row.id,
    type: row.type,
    quantity: row.quantity,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    variantId: variant.id,
    sku: variant.sku,
    productName: resolveVariantDisplayName(variant),
    createdBy: row.createdBy ? { id: row.createdBy.id, email: row.createdBy.email } : null,
    orderId: row.relatedOrderItem?.order.id ?? null,
    orderNumber: row.relatedOrderItem?.order.orderNumber ?? null,
  };
}
