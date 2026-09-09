import { describe, expect, it } from "vitest";
import { computeEmbeddedVatMinor, priceLine, computeOrderTotals } from "./pricing.ts";

describe("computeEmbeddedVatMinor", () => {
  it("extracts 25% Swedish standard VAT embedded in a VAT-inclusive price", () => {
    // 12500 öre @ 25% VAT-inclusive => 2500 öre is VAT
    expect(computeEmbeddedVatMinor(12500, 25)).toBe(2500);
  });

  it("extracts 12% (food) VAT embedded in a VAT-inclusive price", () => {
    // 11200 öre @ 12% VAT-inclusive => 1200 öre is VAT
    expect(computeEmbeddedVatMinor(11200, 12)).toBe(1200);
  });

  it("rounds to the nearest öre", () => {
    expect(computeEmbeddedVatMinor(100, 25)).toBe(20); // 100 * 25 / 125 = 20 exactly
    expect(computeEmbeddedVatMinor(99, 25)).toBe(20); // 99 * 25 / 125 = 19.8 -> 20
  });

  it("is zero for a zero amount", () => {
    expect(computeEmbeddedVatMinor(0, 25)).toBe(0);
  });
});

describe("priceLine", () => {
  it("computes subtotal/total/tax for a multi-quantity line", () => {
    const line = priceLine(29900, 2, 25);
    expect(line).toEqual({
      unitPriceMinor: 29900,
      quantity: 2,
      taxRatePercent: 25,
      lineSubtotalMinor: 59800,
      lineTotalMinor: 59800,
      lineTaxMinor: 11960,
    });
  });
});

describe("computeOrderTotals", () => {
  it("sums lines, adds flat shipping, and never adds tax on top of the total (VAT-inclusive pricing)", () => {
    const lines = [priceLine(29900, 1, 25), priceLine(11200, 2, 12)];
    const totals = computeOrderTotals(lines, 4900, 25);

    const expectedSubtotal = 29900 + 11200 * 2; // 52300
    const expectedShipping = 4900;
    const expectedTotal = expectedSubtotal + expectedShipping;

    expect(totals.subtotalMinor).toBe(expectedSubtotal);
    expect(totals.shippingMinor).toBe(expectedShipping);
    expect(totals.discountMinor).toBe(0);
    expect(totals.totalMinor).toBe(expectedTotal);
    // taxMinor is informational only — it must never have been added into totalMinor.
    expect(totals.taxMinor).toBeGreaterThan(0);
    expect(totals.totalMinor).toBe(expectedSubtotal + expectedShipping);
  });

  it("returns zero totals for an empty line list plus flat shipping", () => {
    const totals = computeOrderTotals([], 4900, 25);
    expect(totals).toEqual({
      subtotalMinor: 0,
      shippingMinor: 4900,
      discountMinor: 0,
      taxMinor: computeEmbeddedVatMinor(4900, 25),
      totalMinor: 4900,
    });
  });
});
