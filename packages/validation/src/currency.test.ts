import { describe, expect, it } from "vitest";
import { currencySchema } from "./currency.ts";

describe("currencySchema", () => {
  it("accepts SEK", () => {
    expect(currencySchema.safeParse("SEK").success).toBe(true);
  });

  it("rejects any other currency (SEK-only for v1 — DECISIONS.md ADR-021)", () => {
    expect(currencySchema.safeParse("EUR").success).toBe(false);
    expect(currencySchema.safeParse("USD").success).toBe(false);
  });
});
