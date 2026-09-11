import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ame-de-fil/database";
import { AdminCategoriesService } from "./admin-categories.service.ts";
import type { CreateTaxonomyInput, UpdateTaxonomyInput } from "./dto/taxonomy.dto.ts";
import type { PrismaService } from "../database/prisma.service.ts";
import { AuditService } from "../audit/audit.service.ts";

const ACTOR_USER_ID = "user-1";

const validInput: CreateTaxonomyInput = {
  translations: [{ locale: "sv-SE", name: "Halsdukar", slug: "halsdukar" }],
};

function makeTxMock() {
  return {
    category: { create: vi.fn().mockResolvedValue({ id: "cat-1" }), delete: vi.fn().mockResolvedValue({}) },
    categoryTranslation: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      upsert: vi.fn().mockResolvedValue({}),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
}

function makePrismaMock(tx: ReturnType<typeof makeTxMock>) {
  return {
    $transaction: vi.fn().mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
  } as unknown as PrismaService;
}

function makeAdminCategoryRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "cat-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    translations: [
      { locale: "sv_SE", name: "Halsdukar", slug: "halsdukar", description: null, metaTitle: null, metaDescription: null },
    ],
    _count: { products: 0 },
    ...overrides,
  };
}

describe("AdminCategoriesService.create", () => {
  it("creates the category and its translations in one transaction", async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx);
    const service = new AdminCategoriesService(prisma, new AuditService(prisma));

    const result = await service.create(validInput, ACTOR_USER_ID);

    expect(result).toEqual({ id: "cat-1" });
    expect(tx.category.create).toHaveBeenCalledTimes(1);
    expect(tx.categoryTranslation.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([expect.objectContaining({ slug: "halsdukar" })]),
      }),
    );
  });

  it("maps a duplicate slug conflict to a 409 ConflictException", async () => {
    const tx = makeTxMock();
    tx.categoryTranslation.createMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "7.10.0",
        meta: { target: ["locale", "slug"] },
      }),
    );
    const prisma = makePrismaMock(tx);
    const service = new AdminCategoriesService(prisma, new AuditService(prisma));

    await expect(service.create(validInput, ACTOR_USER_ID)).rejects.toThrow(ConflictException);
  });
});

describe("AdminCategoriesService.list/getOne", () => {
  it("list maps rows to the lighter list-item shape, most recently updated first", async () => {
    const prisma = {
      category: {
        findMany: vi.fn().mockResolvedValue([makeAdminCategoryRow()]),
        count: vi.fn().mockResolvedValue(1),
      },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminCategoriesService(prisma, new AuditService(prisma));

    const result = await service.list(1, 20);

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ id: "cat-1", name: "Halsdukar", productCount: 0 });
    expect(vi.mocked(prisma.category.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { updatedAt: "desc" } }),
    );
  });

  it("getOne 404s when the category doesn't exist", async () => {
    const prisma = {
      category: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminCategoriesService(prisma, new AuditService(prisma));

    await expect(service.getOne("missing")).rejects.toThrow(NotFoundException);
  });

  it("getOne returns every locale's translation content, not resolved to one", async () => {
    const row = makeAdminCategoryRow({
      translations: [
        { locale: "sv_SE", name: "Halsdukar", slug: "halsdukar", description: null, metaTitle: null, metaDescription: null },
        { locale: "en", name: "Scarves", slug: "scarves", description: null, metaTitle: null, metaDescription: null },
      ],
    });
    const prisma = {
      category: { findUnique: vi.fn().mockResolvedValue(row) },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminCategoriesService(prisma, new AuditService(prisma));

    const result = await service.getOne("cat-1");

    expect(result.translations).toHaveLength(2);
    expect(result.translations.map((t) => t.locale).sort()).toEqual(["en", "sv-SE"]);
  });
});

describe("AdminCategoriesService.update", () => {
  it("404s when the category doesn't exist", async () => {
    const prisma = {
      category: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminCategoriesService(prisma, new AuditService(prisma));

    await expect(service.update("missing", {}, ACTOR_USER_ID)).rejects.toThrow(NotFoundException);
  });

  it("upserts translations per locale without clobbering the other locale", async () => {
    const tx = makeTxMock();
    const prisma = {
      category: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: "cat-1" })
          .mockResolvedValueOnce(makeAdminCategoryRow()),
      },
      $transaction: vi.fn().mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new AdminCategoriesService(prisma, new AuditService(prisma));

    await service.update(
      "cat-1",
      { translations: [{ locale: "en", name: "Scarves", slug: "scarves" }] } as UpdateTaxonomyInput,
      ACTOR_USER_ID,
    );

    expect(tx.categoryTranslation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { categoryId_locale: { categoryId: "cat-1", locale: "en" } },
        update: expect.objectContaining({ name: "Scarves", slug: "scarves" }),
      }),
    );
  });

  it("maps a duplicate slug conflict to a 409 ConflictException", async () => {
    const tx = makeTxMock();
    tx.categoryTranslation.upsert.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "7.10.0",
        meta: { target: ["locale", "slug"] },
      }),
    );
    const prisma = {
      category: { findUnique: vi.fn().mockResolvedValueOnce({ id: "cat-1" }) },
      $transaction: vi.fn().mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new AdminCategoriesService(prisma, new AuditService(prisma));

    await expect(
      service.update(
        "cat-1",
        { translations: [{ locale: "en", name: "X", slug: "taken-slug" }] } as UpdateTaxonomyInput,
        ACTOR_USER_ID,
      ),
    ).rejects.toThrow(ConflictException);
  });
});

describe("AdminCategoriesService.remove", () => {
  it("404s when the category doesn't exist", async () => {
    const prisma = {
      category: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminCategoriesService(prisma, new AuditService(prisma));

    await expect(service.remove("missing", ACTOR_USER_ID)).rejects.toThrow(NotFoundException);
  });

  it("blocks deletion with a 409 when any product is tagged with the category", async () => {
    const prisma = {
      category: {
        findUnique: vi.fn().mockResolvedValue({ id: "cat-1", _count: { products: 3 } }),
      },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminCategoriesService(prisma, new AuditService(prisma));

    await expect(service.remove("cat-1", ACTOR_USER_ID)).rejects.toThrow(ConflictException);
  });

  it("deletes the category when no product is tagged with it", async () => {
    const tx = makeTxMock();
    const prisma = {
      category: {
        findUnique: vi.fn().mockResolvedValue({ id: "cat-1", _count: { products: 0 } }),
      },
      $transaction: vi.fn().mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new AdminCategoriesService(prisma, new AuditService(prisma));

    await service.remove("cat-1", ACTOR_USER_ID);

    expect(tx.category.delete).toHaveBeenCalledWith({ where: { id: "cat-1" } });
  });
});
