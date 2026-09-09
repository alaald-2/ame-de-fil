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
