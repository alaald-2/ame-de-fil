import { z } from "zod";

// Only RESTOCK/ADJUSTMENT here — SALE/RETURN/CANCELLATION are order-driven
// movement types created by checkout/refund logic (a later phase), never by
// a direct admin call (DATABASE.md §4 — every stock change is auditable
// through the movement log, and "auditable" includes recording *why* a
// movement happened via its type, not just that onHand changed).
export const adjustStockSchema = z.object({
  delta: z
    .number()
    .int()
    .refine((value) => value !== 0, "delta must not be zero"),
  reason: z.string().min(1).max(500),
  type: z.enum(["RESTOCK", "ADJUSTMENT"]),
});
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
