import { createHash } from "node:crypto";
import type { RefundOrderResponse } from "./dto/admin-order-responses.ts";

export const REFUND_IDEMPOTENCY_SCOPE = "admin.refund";

export interface RefundRequestForHash {
  orderId: string;
  amountMinor: number;
  reason?: string;
}

// Same "not a canonical-JSON spec, just an internal dedup signal" posture
// as checkout/idempotency.ts's hashCheckoutRequest — the input always
// comes from the same Zod-parsed shape with stable key order.
export function hashRefundRequest(input: RefundRequestForHash): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

// Composed, not the caller's raw Idempotency-Key header value, verified
// against the actual shared table before reuse: IdempotencyKey.key is a
// single global primary key (packages/database/prisma/schema.prisma), and
// checkout's own lookup (checkout.service.ts's checkForReplayOrConflict)
// matches on `key` alone — `scope` is stored but never filtered on. Reusing
// the raw header value here could collide with an unrelated customer's
// checkout key that happens to share the same literal string. Prefixing
// with a fixed, order-scoped namespace checkout could never itself
// produce makes that collision structurally impossible, rather than
// relying on scope discrimination the shared table doesn't implement.
export function buildRefundIdempotencyKey(orderId: string, clientKey: string): string {
  return `admin-refund:${orderId}:${clientKey}`;
}

// What's stored in IdempotencyKey.responseSnapshot for a refund attempt —
// a superset of checkout's simpler "only ever the final response" shape.
// Refunds can't complete in one transaction (the Stripe call must happen
// outside any DB lock — admin-orders.service.ts explains why), so a crash
// mid-flight must be *resumable* under the same key, not just replayed or
// rejected: "pending" records which Refund row a prior attempt under this
// key already reserved, so a retry continues that same attempt (reusing
// its id, and therefore its Stripe idempotency key) instead of creating a
// second reservation.
export type RefundIdempotencySnapshot =
  { phase: "pending"; refundId: string } | { phase: "final"; response: RefundOrderResponse };
