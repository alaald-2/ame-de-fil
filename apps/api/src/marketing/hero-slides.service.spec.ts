import { describe, expect, it, vi } from "vitest";
import { HeroSlidesService } from "./hero-slides.service.ts";
import type { PrismaService } from "../database/prisma.service.ts";

function makePrismaMock(slides: unknown[]) {
  return {
    heroSlide: { findMany: vi.fn().mockResolvedValue(slides) },
  } as unknown as PrismaService;
}

describe("HeroSlidesService.listActive", () => {
  it("queries only isActive slides ordered by position", async () => {
    const prisma = makePrismaMock([]);
    const service = new HeroSlidesService(prisma);

    await service.listActive("en");

    expect(prisma.heroSlide.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { position: "asc" },
    });
  });

  it("resolves the CTA label for the requested locale", async () => {
    const prisma = makePrismaMock([
      {
        id: "slide-1",
        imageUrl: "https://res.cloudinary.com/x/hero.jpg",
        position: 0,
        isActive: true,
        ctaLabelSv: "Handla nu",
        ctaLabelEn: "Shop now",
        ctaHref: "/shop",
      },
    ]);
    const service = new HeroSlidesService(prisma);

    const [sv, en] = await Promise.all([service.listActive("sv-SE"), service.listActive("en")]);

    expect(sv[0]).toMatchObject({ ctaLabel: "Handla nu", ctaHref: "/shop" });
    expect(en[0]).toMatchObject({ ctaLabel: "Shop now", ctaHref: "/shop" });
  });

  it("omits the CTA entirely when there's no href, even if a label exists", async () => {
    const prisma = makePrismaMock([
      {
        id: "slide-1",
        imageUrl: "https://res.cloudinary.com/x/hero.jpg",
        position: 0,
        isActive: true,
        ctaLabelSv: "Handla nu",
        ctaLabelEn: "Shop now",
        ctaHref: null,
      },
    ]);
    const service = new HeroSlidesService(prisma);

    const [slide] = await service.listActive("en");

    expect(slide).toMatchObject({ ctaLabel: null, ctaHref: null });
  });
});
