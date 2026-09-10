import { z } from "zod";

// Amount-based only (approved design) — never a set of line items to
// refund. Capped loosely here (Zod boundary only); the real ceiling is the
// payment's own remaining refundable amount, enforced inside
// AdminOrdersService.issueRefund's locked transaction, never here.
export const refundOrderSchema = z.object({
  amountMinor: z.number().int().positive(),
  reason: z.string().min(1).max(500).optional(),
});
export type RefundOrderInput = z.infer<typeof refundOrderSchema>;
