import { describe, expect, it } from "vitest";
import { Locale as PrismaLocale } from "@ame-de-fil/database";
import { resolveTranslation } from "./translation.mapper.ts";

interface FakeTranslation {
  locale: PrismaLocale;
  name: string;
}

describe("resolveTranslation", () => {
  const sv: FakeTranslation = { locale: PrismaLocale.sv_SE, name: "Svenskt namn" };
  const en: FakeTranslation = { locale: PrismaLocale.en, name: "English name" };

  it("returns the requested locale's translation when present", () => {
    expect(resolveTranslation([sv, en], "en", "sv-SE")).toBe(en);
  });

  it("falls back to the default locale when the requested one is missing", () => {
    expect(resolveTranslation([sv], "en", "sv-SE")?.name).toBe("Svenskt namn");
  });

  it("returns null when neither the requested nor default locale is present", () => {
    // Only English exists; requested is English but default (sv-SE) is
    // asked for as if it were the *requested* locale to simulate the case
    // where the actual requested locale (e.g. via a bad default) is absent too.
    expect(resolveTranslation([], "en", "sv-SE")).toBeNull();
  });

  it("prefers the requested locale over the default even when both exist", () => {
    expect(resolveTranslation([sv, en], "sv-SE", "sv-SE")?.name).toBe("Svenskt namn");
  });
});
