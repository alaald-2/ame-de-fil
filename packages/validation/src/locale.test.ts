import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, localeSchema } from "./locale.ts";

describe("localeSchema", () => {
  it("accepts sv-SE and en", () => {
    expect(localeSchema.safeParse("sv-SE").success).toBe(true);
    expect(localeSchema.safeParse("en").success).toBe(true);
  });

  it("rejects fr-FR (removed — DECISIONS.md ADR-021)", () => {
    expect(localeSchema.safeParse("fr-FR").success).toBe(false);
  });

  it("defaults to sv-SE", () => {
    expect(DEFAULT_LOCALE).toBe("sv-SE");
  });
});
