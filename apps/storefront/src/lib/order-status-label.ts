// OrderStatus -> customer-facing label key + Badge tone. Design discussion
// (docs/plans/customer-order-history): only 10 of the 13 backend OrderStatus
// enum values are ever actually reachable (DRAFT/REFUND_REQUESTED/COMPLETED
// are written nowhere in apps/api — grepped) — those three fall through to
// "unknown" below defensively, never a crash, but with no dedicated copy.
// packages/ui's Badge has only 3 tones (success/neutral/danger, no
// "warning") — deliberately not extended for this; every in-progress status
// shares "neutral".
export type OrderStatusTone = "success" | "neutral" | "danger";

const STATUS_LABEL_KEYS: Record<string, string> = {
  PENDING_PAYMENT: "orderReceived",
  CONFIRMED: "confirmed",
  PAYMENT_SUCCEEDED_STOCK_LOST: "stockIssue",
  IN_PRODUCTION: "beingMade",
  READY_TO_SHIP: "readyToShip",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
  CANCELED: "cancelled",
  REFUNDED: "refunded",
  PARTIALLY_REFUNDED: "partiallyRefunded",
};

const STATUS_TONES: Record<string, OrderStatusTone> = {
  PAYMENT_SUCCEEDED_STOCK_LOST: "danger",
  CANCELED: "danger",
  DELIVERED: "success",
};

export function orderStatusLabelKey(status: string): string {
  return STATUS_LABEL_KEYS[status] ?? "unknown";
}

export function orderStatusTone(status: string): OrderStatusTone {
  return STATUS_TONES[status] ?? "neutral";
}

// Payment.status (schema.prisma PaymentStatus) — every value this project's
// checkout/refund flow can actually produce (PAYMENTS.md §2/§6).
const PAYMENT_STATUS_LABEL_KEYS: Record<string, string> = {
  PENDING: "pending",
  AUTHORIZED: "authorized",
  PAID: "paid",
  FAILED: "failed",
  CANCELED: "canceled",
  REFUNDED: "refunded",
  PARTIALLY_REFUNDED: "partiallyRefunded",
  DISPUTED: "disputed",
};

export function paymentStatusLabelKey(status: string): string {
  return PAYMENT_STATUS_LABEL_KEYS[status] ?? "unknown";
}

// Shipment.status (schema.prisma ShipmentStatus) — ManualShippingProvider
// (ADR-022) is v1's only producer.
const SHIPMENT_STATUS_LABEL_KEYS: Record<string, string> = {
  PENDING: "pending",
  BOOKED: "booked",
  IN_TRANSIT: "inTransit",
  DELIVERED: "delivered",
  FAILED: "failed",
};

export function shipmentStatusLabelKey(status: string): string {
  return SHIPMENT_STATUS_LABEL_KEYS[status] ?? "unknown";
}
