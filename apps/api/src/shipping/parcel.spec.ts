import { describe, expect, it } from "vitest";
import { computeParcelInfo } from "./parcel.ts";

describe("computeParcelInfo", () => {
  it("sums real weightGrams across quantities", () => {
    const result = computeParcelInfo([
      { quantity: 2, variant: { weightGrams: 400, lengthMm: null, widthMm: null, heightMm: null } },
      { quantity: 1, variant: { weightGrams: 100, lengthMm: null, widthMm: null, heightMm: null } },
    ]);

    expect(result.weightGrams).toBe(900);
  });

  it("falls back to 300g per unit when a variant has no weightGrams set", () => {
    const result = computeParcelInfo([
      { quantity: 3, variant: { weightGrams: null, lengthMm: null, widthMm: null, heightMm: null } },
    ]);

    expect(result.weightGrams).toBe(900);
  });

  it("mixes real and fallback weight across lines", () => {
    const result = computeParcelInfo([
      { quantity: 1, variant: { weightGrams: 500, lengthMm: null, widthMm: null, heightMm: null } },
      { quantity: 1, variant: { weightGrams: null, lengthMm: null, widthMm: null, heightMm: null } },
    ]);

    expect(result.weightGrams).toBe(800); // 500 + 300 fallback
  });

  it("omits dimensions entirely when any line is missing one", () => {
    const result = computeParcelInfo([
      { quantity: 1, variant: { weightGrams: 500, lengthMm: 300, widthMm: 200, heightMm: 150 } },
      { quantity: 1, variant: { weightGrams: 500, lengthMm: null, widthMm: null, heightMm: null } },
    ]);

    expect(result.lengthMm).toBeUndefined();
    expect(result.widthMm).toBeUndefined();
    expect(result.heightMm).toBeUndefined();
  });

  it("reports the per-axis max across lines when every line has real dimensions", () => {
    const result = computeParcelInfo([
      { quantity: 1, variant: { weightGrams: 500, lengthMm: 300, widthMm: 100, heightMm: 400 } },
      { quantity: 1, variant: { weightGrams: 500, lengthMm: 200, widthMm: 250, heightMm: 150 } },
    ]);

    expect(result).toMatchObject({ lengthMm: 300, widthMm: 250, heightMm: 400 });
  });
});
