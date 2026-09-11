import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ame-de-fil/database";
import { AdminProductsService } from "./admin-products.service.ts";
import type { CreateProductInput } from "./dto/create-product.dto.ts";
import type { UpdateProductInput } from "./dto/update-product.dto.ts";
import type { PrismaService } from "../database/prisma.service.ts";
import { AuditService } from "../audit/audit.service.ts";

const ACTOR_USER_ID = "user-1";

const validInput: CreateProductInput = {
  translations: [{ locale: "sv-SE", name: "Virkad tröja", slug: "virkad-troja" }],
  options: [
    {
      key: "color",
      values: [{ value: "rust", labelSv: "Rost", labelEn: "Rust" }],
    },
  ],
  variants: [
    {
      sku: "SKU-1",
      priceMinor: 29900,
      taxClassCode: "STANDARD",
      selectedOptionValues: { color: "rust" },
      initialStock: 5,
      tracksStock: true,
      isLimitedEdition: false,
    },
  ],
  categoryIds: [],
  collectionIds: [],
};

function makeTxMock() {
  let optionCounter = 0;
  let valueCounter = 0;
  let variantCounter = 0;

  return {
    product: { create: vi.fn().mockResolvedValue({ id: "prod-1" }) },
    productTranslation: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    productOption: {
      create: vi.fn().mockImplementation(() => Promise.resolve({ id: `opt-${++optionCounter}` })),
    },
    productOptionValue: {
      create: vi.fn().mockImplementation(() => Promise.resolve({ id: `val-${++valueCounter}` })),
    },
    productVariant: {
      create: vi.fn().mockImplementation(() => Promise.resolve({ id: `var-${++variantCounter}` })),
    },
    inventoryItem: { create: vi.fn().mockResolvedValue({ id: "inv-1" }) },
    productVariantOptionValue: { create: vi.fn().mockResolvedValue({}) },
    productCategory: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    productCollection: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
}

function makePrismaMock(tx: ReturnType<typeof makeTxMock>) {
  return {
    taxClass: {
      findMany: vi.fn().mockResolvedValue([{ id: "tax-1", code: "STANDARD", name: "Standard" }]),
    },
    category: { findMany: vi.fn().mockResolvedValue([]) },
    collection: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn().mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
  } as unknown as PrismaService;
}

describe("AdminProductsService.createProduct", () => {
  it("rejects a variant selecting an option value that wasn't declared in options[]", async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx);
    const service = new AdminProductsService(prisma, new AuditService(prisma));

    const input: CreateProductInput = {
      ...validInput,
      variants: [{ ...validInput.variants[0]!, selectedOptionValues: { color: "forest-green" } }],
    };

    await expect(service.createProduct(input, ACTOR_USER_ID)).rejects.toThrow(BadRequestException);
    expect(tx.product.create).not.toHaveBeenCalled();
  });

  it("rejects duplicate SKUs within the same product", async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx);
    const service = new AdminProductsService(prisma, new AuditService(prisma));

    const input: CreateProductInput = {
      ...validInput,
      variants: [validInput.variants[0]!, { ...validInput.variants[0]! }],
    };

    await expect(service.createProduct(input, ACTOR_USER_ID)).rejects.toThrow(BadRequestException);
  });

  it("rejects an unknown tax class code", async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx);
    vi.mocked(prisma.taxClass.findMany).mockResolvedValue([]);
    const service = new AdminProductsService(prisma, new AuditService(prisma));

    await expect(service.createProduct(validInput, ACTOR_USER_ID)).rejects.toThrow(BadRequestException);
  });

  it("rejects an unknown categoryId", async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx);
    const service = new AdminProductsService(prisma, new AuditService(prisma));

    await expect(
      service.createProduct({ ...validInput, categoryIds: ["nonexistent-category"] }, ACTOR_USER_ID),
    ).rejects.toThrow(BadRequestException);
  });

  it("creates the product, translations, options, variants, and inventory in one transaction on valid input", async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx);
    const service = new AdminProductsService(prisma, new AuditService(prisma));

    const result = await service.createProduct(validInput, ACTOR_USER_ID);

    expect(result).toEqual({ id: "prod-1" });
    expect(tx.product.create).toHaveBeenCalledTimes(1);
    expect(tx.productTranslation.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([expect.objectContaining({ slug: "virkad-troja" })]),
      }),
    );
    expect(tx.productOption.create).toHaveBeenCalledTimes(1);
    expect(tx.productOptionValue.create).toHaveBeenCalledTimes(1);
    expect(tx.productVariant.create).toHaveBeenCalledTimes(1);
    expect(tx.inventoryItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ onHand: 5, tracksStock: true }) }),
    );
    expect(tx.productVariantOptionValue.create).toHaveBeenCalledTimes(1);
  });

  it("links provided category and collection ids after validating they exist", async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx);
    vi.mocked(prisma.category.findMany).mockResolvedValue([{ id: "cat-1" }] as never);
    vi.mocked(prisma.collection.findMany).mockResolvedValue([{ id: "col-1" }] as never);
    const service = new AdminProductsService(prisma, new AuditService(prisma));

    await service.createProduct(
      {
        ...validInput,
        categoryIds: ["cat-1"],
        collectionIds: ["col-1"],
      },
      ACTOR_USER_ID,
    );

    expect(tx.productCategory.createMany).toHaveBeenCalledWith({
      data: [{ productId: "prod-1", categoryId: "cat-1" }],
    });
    expect(tx.productCollection.createMany).toHaveBeenCalledWith({
      data: [{ productId: "prod-1", collectionId: "col-1" }],
    });
  });
});

function makeAdminProductRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "prod-1",
    status: "DRAFT",
    publishedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    translations: [
      { locale: "sv_SE", name: "Virkad tröja", slug: "virkad-troja", description: null, story: null, careInstructions: null, materials: null, metaTitle: null, metaDescription: null },
    ],
    images: [],
    options: [],
    categories: [],
    collections: [],
    variants: [
      {
        id: "var-1",
        sku: "SKU-1",
        priceMinor: 29900,
        weightGrams: null,
        isActive: true,
        optionValues: [],
        inventoryItem: { onHand: 5, reserved: 0, tracksStock: true, isLimitedEdition: false, productionTimeDays: null },
        taxClass: { id: "tax-1", code: "STANDARD" },
      },
    ],
    ...overrides,
  };
}

function makeUpdateTxMock() {
  return {
    productTranslation: { upsert: vi.fn().mockResolvedValue({}) },
    productCategory: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }), createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    productCollection: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }), createMany: vi.fn().mockResolvedValue({ count: 0 }) },
    productVariant: { update: vi.fn().mockResolvedValue({}) },
    inventoryItem: { update: vi.fn().mockResolvedValue({}) },
    product: { update: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
}

describe("AdminProductsService.list/getOne", () => {
  it("list maps rows to the lighter list-item shape, most recently updated first", async () => {
    const prisma = {
      product: {
        findMany: vi.fn().mockResolvedValue([makeAdminProductRow()]),
        count: vi.fn().mockResolvedValue(1),
      },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminProductsService(prisma, new AuditService(prisma));

    const result = await service.list(1, 20);

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ id: "prod-1", status: "DRAFT", name: "Virkad tröja", variantCount: 1 });
    expect(vi.mocked(prisma.product.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { updatedAt: "desc" } }),
    );
  });

  it("getOne 404s when the product doesn't exist", async () => {
    const prisma = {
      product: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminProductsService(prisma, new AuditService(prisma));

    await expect(service.getOne("missing")).rejects.toThrow(NotFoundException);
  });

  it("getOne returns every locale's translation content, not resolved to one", async () => {
    const row = makeAdminProductRow({
      translations: [
        { locale: "sv_SE", name: "Virkad tröja", slug: "virkad-troja", description: null, story: null, careInstructions: null, materials: null, metaTitle: null, metaDescription: null },
        { locale: "en", name: "Crocheted sweater", slug: "crocheted-sweater", description: null, story: null, careInstructions: null, materials: null, metaTitle: null, metaDescription: null },
      ],
    });
    const prisma = {
      product: { findUnique: vi.fn().mockResolvedValue(row) },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminProductsService(prisma, new AuditService(prisma));

    const result = await service.getOne("prod-1");

    expect(result.translations).toHaveLength(2);
    expect(result.translations.map((t) => t.locale).sort()).toEqual(["en", "sv-SE"]);
  });
});

describe("AdminProductsService.update", () => {
  it("404s when the product doesn't exist", async () => {
    const prisma = {
      product: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminProductsService(prisma, new AuditService(prisma));

    await expect(service.update("missing", {}, ACTOR_USER_ID)).rejects.toThrow(NotFoundException);
  });

  it("rejects an illegal status transition (e.g. PUBLISHED back to DRAFT)", async () => {
    const prisma = {
      product: {
        findUnique: vi.fn().mockResolvedValue({ id: "prod-1", status: "PUBLISHED", variants: [] }),
      },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminProductsService(prisma, new AuditService(prisma));

    await expect(
      service.update("prod-1", { status: "DRAFT" } as UpdateProductInput, ACTOR_USER_ID),
    ).rejects.toThrow(ConflictException);
  });

  it("allows the legal DRAFT -> PUBLISHED transition and sets publishedAt", async () => {
    const tx = makeUpdateTxMock();
    const finalRow = makeAdminProductRow({ status: "PUBLISHED" });
    const prisma = {
      product: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: "prod-1", status: "DRAFT", variants: [] })
          .mockResolvedValueOnce(finalRow),
      },
      $transaction: vi.fn().mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new AdminProductsService(prisma, new AuditService(prisma));

    const result = await service.update("prod-1", { status: "PUBLISHED" } as UpdateProductInput, ACTOR_USER_ID);

    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PUBLISHED", publishedAt: expect.any(Date) }) }),
    );
    expect(result.status).toBe("PUBLISHED");
  });

  it("rejects a variant id that doesn't belong to this product", async () => {
    const prisma = {
      product: {
        findUnique: vi.fn().mockResolvedValue({ id: "prod-1", status: "DRAFT", variants: [{ id: "var-1" }] }),
      },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminProductsService(prisma, new AuditService(prisma));

    await expect(
      service.update(
        "prod-1",
        { variants: [{ id: "not-a-real-variant", priceMinor: 100 }] } as UpdateProductInput,
        ACTOR_USER_ID,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("upserts translations per locale and replaces category/collection membership", async () => {
    const tx = makeUpdateTxMock();
    const prisma = {
      product: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: "prod-1", status: "DRAFT", variants: [] })
          .mockResolvedValueOnce(makeAdminProductRow()),
      },
      category: { findMany: vi.fn().mockResolvedValue([{ id: "cat-1" }]) },
      collection: { findMany: vi.fn().mockResolvedValue([{ id: "col-1" }]) },
      $transaction: vi.fn().mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new AdminProductsService(prisma, new AuditService(prisma));

    await service.update(
      "prod-1",
      {
        translations: [{ locale: "en", name: "New name", slug: "new-name" }],
        categoryIds: ["cat-1"],
        collectionIds: ["col-1"],
      } as UpdateProductInput,
      ACTOR_USER_ID,
    );

    expect(tx.productTranslation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId_locale: { productId: "prod-1", locale: "en" } },
        update: expect.objectContaining({ name: "New name", slug: "new-name" }),
      }),
    );
    expect(tx.productCategory.deleteMany).toHaveBeenCalledWith({ where: { productId: "prod-1" } });
    expect(tx.productCategory.createMany).toHaveBeenCalledWith({
      data: [{ productId: "prod-1", categoryId: "cat-1" }],
    });
    expect(tx.productCollection.createMany).toHaveBeenCalledWith({
      data: [{ productId: "prod-1", collectionId: "col-1" }],
    });
  });

  it("maps a duplicate slug conflict to a 409 ConflictException", async () => {
    const tx = makeUpdateTxMock();
    tx.productTranslation.upsert.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "7.10.0",
        meta: { target: ["locale", "slug"] },
      }),
    );
    const prisma = {
      product: {
        findUnique: vi.fn().mockResolvedValueOnce({ id: "prod-1", status: "DRAFT", variants: [] }),
      },
      $transaction: vi.fn().mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new AdminProductsService(prisma, new AuditService(prisma));

    await expect(
      service.update(
        "prod-1",
        { translations: [{ locale: "en", name: "X", slug: "taken-slug" }] } as UpdateProductInput,
        ACTOR_USER_ID,
      ),
    ).rejects.toThrow(ConflictException);
  });
});
