import type { BadgeTone } from "@ame-de-fil/ui";

// Pure status -> tone mapping, no i18n (the visible label comes from the
// caller's own translator — see the Orders.status/.paymentStatus/
// .shipmentStatus message namespaces). Only three tones exist (Badge's own
// set) — anything that isn't unambiguously a success or a problem state
// stays neutral, rather than inventing a fourth "warning" tone this
// checkpoint (DECISIONS.md's token review left --color-warning deferred).
export function orderStatusTone(status: string): BadgeTone {
  switch (status) {
    case "DELIVERED":
    case "COMPLETED":
      return "success";
    case "CANCELED":
    case "PAYMENT_SUCCEEDED_STOCK_LOST":
      return "danger";
    default:
      return "neutral";
  }
}

export function paymentStatusTone(status: string): BadgeTone {
  switch (status) {
    case "PAID":
      return "success";
    case "FAILED":
    case "CANCELED":
    case "DISPUTED":
      return "danger";
    default:
      return "neutral";
  }
}

export function shipmentStatusTone(status: string): BadgeTone {
  switch (status) {
    case "DELIVERED":
      return "success";
    case "FAILED":
      return "danger";
    default:
      return "neutral";
  }
}

export function refundStatusTone(status: string): BadgeTone {
  switch (status) {
    case "SUCCEEDED":
      return "success";
    case "FAILED":
      return "danger";
    default:
      return "neutral";
  }
}

// The fulfillment state machine as admin-orders.service.ts actually
// enforces it (READY_TO_SHIP accepts two predecessors — CONFIRMED directly,
// or IN_PRODUCTION once a made-to-order item finishes). Mirrored here only
// to decide which single action button to show; the backend's own guarded
// conditional update is the real enforcement, not this.
export function canMarkReadyToShip(status: string): boolean {
  return status === "CONFIRMED" || status === "IN_PRODUCTION";
}

export function canMarkShipped(status: string): boolean {
  return status === "READY_TO_SHIP";
}

export function canMarkDelivered(status: string): boolean {
  return status === "SHIPPED";
}

const REFUND_ELIGIBLE_PAYMENT_STATUSES = new Set(["PAID", "PARTIALLY_REFUNDED"]);

export function hasRefundablePayment(payments: { status: string }[]): boolean {
  return payments.some((payment) => REFUND_ELIGIBLE_PAYMENT_STATUSES.has(payment.status));
}
