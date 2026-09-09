import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { Locale as PrismaLocale, ProductStatus } from "@ame-de-fil/database";
import { ProductsService } from "./products.service.ts";
import type { PrismaService } from "../database/prisma.service.ts";

function makePrismaMock(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    product: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null),
      ...overrides,
    },
  } as unknown as PrismaService;
}

const publishedProductRow = {
  id: "prod-1",
  status: ProductStatus.PUBLISHED,
  createdAt: new Date(),
  updatedAt: new Date(),
  publishedAt: new Date(),
  translations: [
    {
      id: "t-1",
      productId: "prod-1",
      locale: PrismaLocale.sv_SE,
      name: "Virkad tröja",
      slug: "virkad-troja",
      description: null,
      story: null,
      careInstructions: null,
      materials: null,
      metaTitle: null,
      metaDescription: null,
    },
  ],
  images: [],
  categories: [],
  collections: [],
  variants: [],
};

describe("ProductsService.list", () => {
  it("only queries PUBLISHED products", async () => {
    const prisma = makePrismaMock();
    const service = new ProductsService(prisma);

    await service.list({ locale: "sv-SE", page: 1, pageSize: 20 });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: ProductStatus.PUBLISHED }),
      }),
    );
  });

  it("applies category/collection filters when provided", async () => {
    const prisma = makePrismaMock();
    const service = new ProductsService(prisma);

    await service.list({
      locale: "sv-SE",
      category: "cat-1",
      collection: "col-1",
      page: 1,
      pageSize: 20,
    });

    const call = vi.mocked(prisma.product.findMany).mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(call.where).toMatchObject({
      categories: { some: { category: { id: "cat-1" } } },
      collections: { some: { collection: { id: "col-1" } } },
    });
  });

  it("paginates using skip/take derived from page and pageSize", async () => {
    const prisma = makePrismaMock();
    const service = new ProductsService(prisma);

    await service.list({ locale: "sv-SE", page: 3, pageSize: 10 });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });

  it("maps rows and filters out any with no usable translation", async () => {
    const prisma = makePrismaMock({
      findMany: vi
        .fn()
        .mockResolvedValue([publishedProductRow, { ...publishedProductRow, translations: [] }]),
      count: vi.fn().mockResolvedValue(2),
    });
    const service = new ProductsService(prisma);

    const result = await service.list({ locale: "sv-SE", page: 1, pageSize: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(2); // count reflects the raw DB total, not post-filter
  });
});

describe("ProductsService.getBySlug", () => {
  it("throws NotFoundException when no product matches the slug", async () => {
    const prisma = makePrismaMock({ findFirst: vi.fn().mockResolvedValue(null) });
    const service = new ProductsService(prisma);

    await expect(service.getBySlug("nonexistent", "sv-SE")).rejects.toThrow(NotFoundException);
  });

  it("throws NotFoundException when the product exists but has no usable translation", async () => {
    const prisma = makePrismaMock({
      findFirst: vi.fn().mockResolvedValue({ ...publishedProductRow, translations: [] }),
    });
    const service = new ProductsService(prisma);

    await expect(service.getBySlug("virkad-troja", "sv-SE")).rejects.toThrow(NotFoundException);
  });

  it("returns the mapped product when found with a usable translation", async () => {
    const prisma = makePrismaMock({ findFirst: vi.fn().mockResolvedValue(publishedProductRow) });
    const service = new ProductsService(prisma);

    const result = await service.getBySlug("virkad-troja", "sv-SE");
    expect(result.slug).toBe("virkad-troja");
  });

  it("only looks up PUBLISHED products by slug", async () => {
    const prisma = makePrismaMock({ findFirst: vi.fn().mockResolvedValue(publishedProductRow) });
    const service = new ProductsService(prisma);

    await service.getBySlug("virkad-troja", "sv-SE");

    expect(prisma.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: ProductStatus.PUBLISHED }),
      }),
    );
  });
});
