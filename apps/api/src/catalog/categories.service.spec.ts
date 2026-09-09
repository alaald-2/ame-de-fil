import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { Locale as PrismaLocale } from "@ame-de-fil/database";
import { CategoriesService } from "./categories.service.ts";
import type { PrismaService } from "../database/prisma.service.ts";

const categoryRow = {
  id: "cat-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  translations: [
    {
      id: "t-1",
      categoryId: "cat-1",
      locale: PrismaLocale.sv_SE,
      name: "Tröjor",
      slug: "trojor",
      description: null,
      metaTitle: null,
      metaDescription: null,
    },
  ],
};

function makePrismaMock(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    category: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      ...overrides,
    },
    product: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  } as unknown as PrismaService;
}

describe("CategoriesService", () => {
  it("list() returns only categories with a usable translation, in the requested locale", async () => {
    const prisma = makePrismaMock({
      findMany: vi
        .fn()
        .mockResolvedValue([categoryRow, { ...categoryRow, id: "cat-2", translations: [] }]),
    });
    const service = new CategoriesService(prisma);

    const result = await service.list("sv-SE");

    expect(result).toHaveLength(1);
    expect(result[0]?.slug).toBe("trojor");
  });

  it("getBySlug() throws NotFoundException when no category matches", async () => {
    const prisma = makePrismaMock({ findFirst: vi.fn().mockResolvedValue(null) });
    const service = new CategoriesService(prisma);

    await expect(service.getBySlug("nonexistent", "sv-SE", 1, 20)).rejects.toThrow(
      NotFoundException,
    );
  });

  it("getBySlug() throws NotFoundException when the category has no usable translation", async () => {
    const prisma = makePrismaMock({
      findFirst: vi.fn().mockResolvedValue({ ...categoryRow, translations: [] }),
    });
    const service = new CategoriesService(prisma);

    await expect(service.getBySlug("trojor", "sv-SE", 1, 20)).rejects.toThrow(NotFoundException);
  });

  it("getBySlug() scopes its product query to the resolved category id", async () => {
    const prisma = makePrismaMock({ findFirst: vi.fn().mockResolvedValue(categoryRow) });
    const service = new CategoriesService(prisma);

    await service.getBySlug("trojor", "sv-SE", 1, 20);

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ categories: { some: { categoryId: "cat-1" } } }),
      }),
    );
  });
});
