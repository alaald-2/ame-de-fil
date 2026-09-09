import { describe, expect, it } from "vitest";
import { generateOrderNumber } from "./order-number.ts";

describe("generateOrderNumber", () => {
  it("embeds the given date and an 8-character suffix", () => {
    const orderNumber = generateOrderNumber(new Date("2026-09-09T12:00:00.000Z"));
    expect(orderNumber).toMatch(/^AF-20260909-[A-Z2-9]{8}$/);
  });

  it("never emits ambiguous characters (0/O/1/I) in the random suffix", () => {
    for (let i = 0; i < 200; i++) {
      const suffix = generateOrderNumber().split("-")[2];
      expect(suffix).not.toMatch(/[01OI]/);
    }
  });

  it("generates distinct values across calls", () => {
    const numbers = new Set(Array.from({ length: 50 }, () => generateOrderNumber()));
    expect(numbers.size).toBe(50);
  });
});
