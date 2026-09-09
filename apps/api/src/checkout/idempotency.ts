import { createHash } from "node:crypto";
import type { CartIdentity } from "../common/cart-identity.ts";
import type { InitiateCheckoutInput } from "./dto/initiate-checkout.dto.ts";

export const CHECKOUT_IDEMPOTENCY_SCOPE = "checkout";

// Detects "the same logical request retried under this key" vs. "this key
// was reused for a genuinely different request" (IdempotencyKey.requestHash
// — DATABASE.md). Not a byte-perfect canonical-JSON spec: the input always
// comes from the same Zod-parsed shape with stable key insertion order, so
// plain JSON.stringify is sufficient for this internal dedup signal.
export function hashCheckoutRequest(identity: CartIdentity, input: InitiateCheckoutInput): string {
  const identityKey =
    "userId" in identity ? `user:${identity.userId}` : `guest:${identity.guestToken}`;
  return createHash("sha256").update(JSON.stringify({ identityKey, input })).digest("hex");
}
