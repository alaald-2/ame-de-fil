import { describe, expect, it, vi } from "vitest";
import { HomepageSectionKey } from "@ame-de-fil/database";
import { HomepageSectionsService } from "./homepage-sections.service.ts";
import type { PrismaService } from "../database/prisma.service.ts";

function makePrismaMock(rows: unknown[]) {
  return {
    homepageSection: { findMany: vi.fn().mockResolvedValue(rows) },
  } as unknown as PrismaService;
}

describe("HomepageSectionsService.list", () => {
  it("returns both known slots in a fixed order, with null for any missing row", async () => {
    const prisma = makePrismaMock([]);
    const service = new HomepageSectionsService(prisma);

    const result = await service.list();

    expect(result).toEqual([
      { key: "story", imageUrl: null },
      { key: "made-to-order", imageUrl: null },
    ]);
  });

  it("fills in a real imageUrl for whichever slot has a row", async () => {
    const prisma = makePrismaMock([
      { key: HomepageSectionKey.MADE_TO_ORDER, imageUrl: "https://res.cloudinary.com/x/mto.jpg" },
    ]);
    const service = new HomepageSectionsService(prisma);

    const result = await service.list();

    expect(result).toEqual([
      { key: "story", imageUrl: null },
      { key: "made-to-order", imageUrl: "https://res.cloudinary.com/x/mto.jpg" },
    ]);
  });
});
