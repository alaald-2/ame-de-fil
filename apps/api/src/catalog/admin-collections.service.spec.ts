import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ame-de-fil/database";
import { AdminCollectionsService } from "./admin-collections.service.ts";
import type { CreateTaxonomyInput, UpdateTaxonomyInput } from "./dto/taxonomy.dto.ts";
import type { PrismaService } from "../database/prisma.service.ts";
import { AuditService } from "../audit/audit.service.ts";

const ACTOR_USER_ID = "user-1";

const validInput: CreateTaxonomyInput = {
  translations: [{ locale: "sv-SE", name: "Höstkollektion", slug: "hostkollektion" }],
};

function makeTxMock() {
  return {
    collection: { create: vi.fn().mockResolvedValue({ id: "col-1" }), delete: vi.fn().mockResolvedValue({}) },
    collectionTranslation: {
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

function makeAdminCollectionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "col-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    translations: [
      { locale: "sv_SE", name: "Höstkollektion", slug: "hostkollektion", description: null, metaTitle: null, metaDescription: null },
    ],
    _count: { products: 0 },
    ...overrides,
  };
}

describe("AdminCollectionsService.create", () => {
  it("creates the collection and its translations in one transaction", async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx);
    const service = new AdminCollectionsService(prisma, new AuditService(prisma));

    const result = await service.create(validInput, ACTOR_USER_ID);

    expect(result).toEqual({ id: "col-1" });
    expect(tx.collection.create).toHaveBeenCalledTimes(1);
    expect(tx.collectionTranslation.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([expect.objectContaining({ slug: "hostkollektion" })]),
      }),
    );
  });

  it("maps a duplicate slug conflict to a 409 ConflictException", async () => {
    const tx = makeTxMock();
    tx.collectionTranslation.createMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "7.10.0",
        meta: { target: ["locale", "slug"] },
      }),
    );
    const prisma = makePrismaMock(tx);
    const service = new AdminCollectionsService(prisma, new AuditService(prisma));

    await expect(service.create(validInput, ACTOR_USER_ID)).rejects.toThrow(ConflictException);
  });
});

describe("AdminCollectionsService.list/getOne", () => {
  it("list maps rows to the lighter list-item shape, most recently updated first", async () => {
    const prisma = {
      collection: {
        findMany: vi.fn().mockResolvedValue([makeAdminCollectionRow()]),
        count: vi.fn().mockResolvedValue(1),
      },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminCollectionsService(prisma, new AuditService(prisma));

    const result = await service.list(1, 20);

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ id: "col-1", name: "Höstkollektion", productCount: 0 });
    expect(vi.mocked(prisma.collection.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { updatedAt: "desc" } }),
    );
  });

  it("getOne 404s when the collection doesn't exist", async () => {
    const prisma = {
      collection: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminCollectionsService(prisma, new AuditService(prisma));

    await expect(service.getOne("missing")).rejects.toThrow(NotFoundException);
  });

  it("getOne returns every locale's translation content, not resolved to one", async () => {
    const row = makeAdminCollectionRow({
      translations: [
        { locale: "sv_SE", name: "Höstkollektion", slug: "hostkollektion", description: null, metaTitle: null, metaDescription: null },
        { locale: "en", name: "Autumn Collection", slug: "autumn-collection", description: null, metaTitle: null, metaDescription: null },
      ],
    });
    const prisma = {
      collection: { findUnique: vi.fn().mockResolvedValue(row) },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminCollectionsService(prisma, new AuditService(prisma));

    const result = await service.getOne("col-1");

    expect(result.translations).toHaveLength(2);
    expect(result.translations.map((t) => t.locale).sort()).toEqual(["en", "sv-SE"]);
  });
});

describe("AdminCollectionsService.update", () => {
  it("404s when the collection doesn't exist", async () => {
    const prisma = {
      collection: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminCollectionsService(prisma, new AuditService(prisma));

    await expect(service.update("missing", {}, ACTOR_USER_ID)).rejects.toThrow(NotFoundException);
  });

  it("upserts translations per locale without clobbering the other locale", async () => {
    const tx = makeTxMock();
    const prisma = {
      collection: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: "col-1" })
          .mockResolvedValueOnce(makeAdminCollectionRow()),
      },
      $transaction: vi.fn().mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new AdminCollectionsService(prisma, new AuditService(prisma));

    await service.update(
      "col-1",
      { translations: [{ locale: "en", name: "Autumn Collection", slug: "autumn-collection" }] } as UpdateTaxonomyInput,
      ACTOR_USER_ID,
    );

    expect(tx.collectionTranslation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { collectionId_locale: { collectionId: "col-1", locale: "en" } },
        update: expect.objectContaining({ name: "Autumn Collection", slug: "autumn-collection" }),
      }),
    );
  });

  it("maps a duplicate slug conflict to a 409 ConflictException", async () => {
    const tx = makeTxMock();
    tx.collectionTranslation.upsert.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "7.10.0",
        meta: { target: ["locale", "slug"] },
      }),
    );
    const prisma = {
      collection: { findUnique: vi.fn().mockResolvedValueOnce({ id: "col-1" }) },
      $transaction: vi.fn().mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new AdminCollectionsService(prisma, new AuditService(prisma));

    await expect(
      service.update(
        "col-1",
        { translations: [{ locale: "en", name: "X", slug: "taken-slug" }] } as UpdateTaxonomyInput,
        ACTOR_USER_ID,
      ),
    ).rejects.toThrow(ConflictException);
  });
});

describe("AdminCollectionsService.remove", () => {
  it("404s when the collection doesn't exist", async () => {
    const prisma = {
      collection: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminCollectionsService(prisma, new AuditService(prisma));

    await expect(service.remove("missing", ACTOR_USER_ID)).rejects.toThrow(NotFoundException);
  });

  it("blocks deletion with a 409 when any product is tagged with the collection", async () => {
    const prisma = {
      collection: {
        findUnique: vi.fn().mockResolvedValue({ id: "col-1", _count: { products: 3 } }),
      },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminCollectionsService(prisma, new AuditService(prisma));

    await expect(service.remove("col-1", ACTOR_USER_ID)).rejects.toThrow(ConflictException);
  });

  it("deletes the collection when no product is tagged with it", async () => {
    const tx = makeTxMock();
    const prisma = {
      collection: {
        findUnique: vi.fn().mockResolvedValue({ id: "col-1", _count: { products: 0 } }),
      },
      $transaction: vi.fn().mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new AdminCollectionsService(prisma, new AuditService(prisma));

    await service.remove("col-1", ACTOR_USER_ID);

    expect(tx.collection.delete).toHaveBeenCalledWith({ where: { id: "col-1" } });
  });
});
