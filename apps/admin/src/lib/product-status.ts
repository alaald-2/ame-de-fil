import type { BadgeTone } from "./order-status";

// Pure status -> tone mapping, no i18n (the visible label comes from the
// caller's own translator — see Products.status.*). PUBLISHED is the only
// unambiguous "good" state; ARCHIVED reads as a problem/end state the same
// way CANCELED does for orders.
export function productStatusTone(status: string): BadgeTone {
  switch (status) {
    case "PUBLISHED":
      return "success";
    case "ARCHIVED":
      return "danger";
    default:
      return "neutral";
  }
}

// DRAFT -> PUBLISHED -> ARCHIVED, with ARCHIVED -> PUBLISHED as the way
// back, mirroring the real state machine admin-products.service.ts enforces
// (LEGAL_STATUS_TRANSITIONS) — mirrored here only to decide which single
// action button to show, exactly like order-status.ts's
// canMarkReadyToShip/canMarkShipped/canMarkDelivered. The backend's own
// guarded update is the real enforcement, not this.
export function nextProductStatus(status: string): "PUBLISHED" | "ARCHIVED" | null {
  if (status === "DRAFT") return "PUBLISHED";
  if (status === "PUBLISHED") return "ARCHIVED";
  if (status === "ARCHIVED") return "PUBLISHED";
  return null;
}
