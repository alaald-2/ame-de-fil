import { z } from "zod";

const inventoryMovementResponseSchema = z.object({
  id: z.string(),
  type: z.enum(["SALE", "RETURN", "CANCELLATION", "RESTOCK", "ADJUSTMENT"]),
  quantity: z.number().int(),
  reason: z.string().nullable(),
  createdByUserId: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const inventoryItemResponseSchema = z.object({
  variantId: z.string(),
  sku: z.string(),
  productName: z.string(),
  onHand: z.number().int(),
  reserved: z.number().int(),
  available: z.boolean(),
  availableQuantity: z.number().int().nullable(),
  tracksStock: z.boolean(),
  isLimitedEdition: z.boolean(),
  productionTimeDays: z.number().int().nullable(),
  lowStockThreshold: z.number().int().nullable(),
});

export const listInventoryResponseSchema = z.object({
  items: z.array(inventoryItemResponseSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export const inventoryDetailResponseSchema = inventoryItemResponseSchema.extend({
  movements: z.array(inventoryMovementResponseSchema),
});

// Never a customer name/email/address — just enough to cross-reference
// GET /admin/orders/:id if an admin needs the full order (inventory-views
// checkpoint).
const reservationListItemResponseSchema = z.object({
  id: z.string(),
  status: z.enum(["PENDING", "CONSUMED", "EXPIRED"]),
  quantity: z.number().int(),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  variantId: z.string(),
  sku: z.string(),
  productName: z.string(),
  orderId: z.string(),
  orderNumber: z.string(),
});

export const listReservationsResponseSchema = z.object({
  items: z.array(reservationListItemResponseSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

// createdBy/orderId/orderNumber are all nullable — a system-driven
// movement (SALE) never had an admin actor, and either FK can resolve to
// null via onDelete: SetNull (a since-deleted admin or order item), never
// an error (mirrors admin-audit-log's identical precedent).
const movementLedgerItemResponseSchema = z.object({
  id: z.string(),
  type: z.enum(["SALE", "RETURN", "CANCELLATION", "RESTOCK", "ADJUSTMENT"]),
  quantity: z.number().int(),
  reason: z.string().nullable(),
  createdAt: z.iso.datetime(),
  variantId: z.string(),
  sku: z.string(),
  productName: z.string(),
  createdBy: z.object({ id: z.string(), email: z.string() }).nullable(),
  orderId: z.string().nullable(),
  orderNumber: z.string().nullable(),
});

export const listMovementsResponseSchema = z.object({
  items: z.array(movementLedgerItemResponseSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
