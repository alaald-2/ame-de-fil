import { z } from "zod";

// Deliberately minimal (PAYMENTS.md §4, DECISIONS.md ADR-024) — this is a
// guest-reachable polling endpoint, so the response carries only what the
// storefront's poll loop needs to decide whether to trust the order data it
// already holds from the original checkout response. No addresses, line
// items, amounts, or any other order/customer PII — those are never
// re-served by this endpoint, by anyone, authenticated or not.
export const orderStatusResponseSchema = z.object({
  status: z.string(),
  payment: z.object({ status: z.string() }),
});
export type OrderStatusResponse = z.infer<typeof orderStatusResponseSchema>;
