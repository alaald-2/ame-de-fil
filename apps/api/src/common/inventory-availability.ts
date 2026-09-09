// Single source of truth for "available = onHand - reserved" (the
// checkpoint's own framing) — used by catalog (product mapper), inventory
// (admin visibility), and cart (add/update quantity checks). Extracted here
// specifically because a third consumer was about to duplicate it a third time.
export interface InventoryAvailabilityInput {
  tracksStock: boolean;
  onHand: number;
  reserved: number;
}

export interface InventoryAvailability {
  available: boolean;
  // Concrete remaining quantity for stock-tracked items; null for
  // made-to-order (tracksStock=false) — there's no finite ceiling to report,
  // only a production time, so "how many can I add" doesn't apply.
  availableQuantity: number | null;
}

export function computeAvailability(inventory: InventoryAvailabilityInput): InventoryAvailability {
  if (!inventory.tracksStock) {
    return { available: true, availableQuantity: null };
  }
  const availableQuantity = inventory.onHand - inventory.reserved;
  return { available: availableQuantity > 0, availableQuantity };
}
