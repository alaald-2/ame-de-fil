import type { BadgeTone } from "./order-status";

// Pure status -> tone mapping, no i18n — mirrors order-status.ts's own
// convention (the visible label comes from the caller's translator, via
// the Inventory.reservationStatus/.movementType message namespaces).
export function reservationStatusTone(status: string): BadgeTone {
  switch (status) {
    case "CONSUMED":
      return "success";
    case "EXPIRED":
      return "danger";
    default:
      return "neutral";
  }
}

export function movementTypeTone(type: string): BadgeTone {
  switch (type) {
    case "RESTOCK":
    case "RETURN":
      return "success";
    case "SALE":
      return "danger";
    default:
      return "neutral";
  }
}
