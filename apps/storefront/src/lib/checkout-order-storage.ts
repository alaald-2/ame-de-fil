import type { CheckoutResponse } from "@ame-de-fil/types";

// Survives a possible Stripe 3DS redirect (PAYMENTS.md §4, DECISIONS.md
// ADR-024) — the checkout response (including its one-time orderStatusToken)
// only ever lives in this tab's React state otherwise, which a full-page
// navigation to Stripe's hosted challenge and back would lose entirely.
// sessionStorage, not localStorage: this data has no reason to outlive the
// tab. return_url deliberately carries only the non-sensitive orderId in
// its query string — this is where the rest gets read back from, same
// origin, never sent over the network except via this app's own explicit
// fetch calls. Wrapped defensively: a private window, blocked site data, or
// a cross-context redirect can make sessionStorage unavailable or empty —
// callers degrade to a "still confirming" message rather than erroring.
const STORAGE_KEY_PREFIX = "ame-checkout-order:";

export function saveCheckoutOrder(order: CheckoutResponse): void {
  try {
    sessionStorage.setItem(STORAGE_KEY_PREFIX + order.orderId, JSON.stringify(order));
  } catch {
    // Storage unavailable — nothing to do; a redirect-based confirmation
    // landing on /checkout/complete simply won't find this order again.
  }
}

export function readCheckoutOrder(orderId: string): CheckoutResponse | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_PREFIX + orderId);
    return raw ? (JSON.parse(raw) as CheckoutResponse) : null;
  } catch {
    return null;
  }
}
