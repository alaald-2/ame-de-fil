import { describe, expect, it } from "vitest";
import { computeAvailability } from "./inventory-availability.ts";

describe("computeAvailability", () => {
  it("is available when onHand exceeds reserved", () => {
    const result = computeAvailability({ tracksStock: true, onHand: 5, reserved: 2 });
    expect(result).toEqual({ available: true, availableQuantity: 3 });
  });

  it("is unavailable when onHand equals reserved", () => {
    const result = computeAvailability({ tracksStock: true, onHand: 2, reserved: 2 });
    expect(result).toEqual({ available: false, availableQuantity: 0 });
  });

  it("is unavailable when reserved exceeds onHand (should never happen, but must not crash or report positive)", () => {
    const result = computeAvailability({ tracksStock: true, onHand: 1, reserved: 3 });
    expect(result.available).toBe(false);
    expect(result.availableQuantity).toBe(-2);
  });

  it("is always available for made-to-order (tracksStock=false), with no quantity ceiling", () => {
    const result = computeAvailability({ tracksStock: false, onHand: 0, reserved: 0 });
    expect(result).toEqual({ available: true, availableQuantity: null });
  });
});
