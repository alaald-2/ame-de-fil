import { describe, expect, it } from "vitest";
import { moneySchema } from "./money.ts";

describe("moneySchema", () => {
  it("accepts a valid SEK amount in minor units", () => {
    expect(moneySchema.safeParse({ amountMinor: 12900, currency: "SEK" }).success).toBe(true);
  });

  it("rejects a negative amount", () => {
    expect(moneySchema.safeParse({ amountMinor: -1, currency: "SEK" }).success).toBe(false);
  });

  it("rejects a non-integer amount (minor units must be whole)", () => {
    expect(moneySchema.safeParse({ amountMinor: 129.5, currency: "SEK" }).success).toBe(false);
  });

  it("rejects a non-SEK currency", () => {
    expect(moneySchema.safeParse({ amountMinor: 100, currency: "EUR" }).success).toBe(false);
  });
});
