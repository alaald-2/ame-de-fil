import { describe, expect, it, vi } from "vitest";
import { HomepageSectionKey } from "@ame-de-fil/database";
import { HomepageSectionsService } from "./homepage-sections.service.ts";
import type { PrismaService } from "../database/prisma.service.ts";

function makePrismaMock(rows: unknown[]) {
  return {
    homepageSection: { findMany: vi.fn().mockResolvedValue(rows) },
  } as unknown as PrismaService;
}

const EMPTY_SECTION = {
  imageUrl: null,
  eyebrow: null,
  title: null,
  description: null,
  ctaLabel: null,
  ctaHref: null,
};

describe("HomepageSectionsService.list", () => {
  it("returns all three known slots in a fixed order, with null for any missing row", async () => {
    const prisma = makePrismaMock([]);
    const service = new HomepageSectionsService(prisma);

    const result = await service.list("sv-SE");

    expect(result).toEqual([
      { key: "hero", ...EMPTY_SECTION },
      { key: "story", ...EMPTY_SECTION },
      { key: "made-to-order", ...EMPTY_SECTION },
      { key: "announcement", ...EMPTY_SECTION },
    ]);
  });

  it("fills in a real imageUrl for whichever slot has a row", async () => {
    const prisma = makePrismaMock([
      { key: HomepageSectionKey.MADE_TO_ORDER, imageUrl: "https://res.cloudinary.com/x/mto.jpg" },
    ]);
    const service = new HomepageSectionsService(prisma);

    const result = await service.list("sv-SE");

    expect(result).toEqual([
      { key: "hero", ...EMPTY_SECTION },
      { key: "story", ...EMPTY_SECTION },
      { key: "made-to-order", ...EMPTY_SECTION, imageUrl: "https://res.cloudinary.com/x/mto.jpg" },
      { key: "announcement", ...EMPTY_SECTION },
    ]);
  });

  it("resolves each bilingual text field to the requested locale", async () => {
    const prisma = makePrismaMock([
      {
        key: HomepageSectionKey.STORY,
        imageUrl: null,
        eyebrowSv: "Vårt hantverk",
        eyebrowEn: "Our craft",
        titleSv: "Handgjort, i små serier",
        titleEn: "Made by hand, in small batches",
        descriptionSv: null,
        descriptionEn: null,
        ctaLabelSv: "Läs vår historia",
        ctaLabelEn: "Read our story",
        ctaHref: "/about",
      },
    ]);
    const service = new HomepageSectionsService(prisma);

    const [, sv] = await service.list("sv-SE");
    const [, en] = await service.list("en");

    expect(sv).toMatchObject({ eyebrow: "Vårt hantverk", title: "Handgjort, i små serier", ctaLabel: "Läs vår historia" });
    expect(en).toMatchObject({ eyebrow: "Our craft", title: "Made by hand, in small batches", ctaLabel: "Read our story" });
  });
});
