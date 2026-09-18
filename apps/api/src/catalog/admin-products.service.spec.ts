import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@ame-de-fil/database";
import { AdminProductsService } from "./admin-products.service.ts";
import type { CreateProductInput } from "./dto/create-product.dto.ts";
import type { UpdateProductInput } from "./dto/update-product.dto.ts";
import type { PrismaService } from "../database/prisma.service.ts";
import { AuditService } from "../audit/audit.service.ts";
import type { ImageStorageProvider } from "../images/image-storage.provider.ts";

const ACTOR_USER_ID = "user-1";

function makeImageStorageMock(): ImageStorageProvider {
  return {
    upload: vi.fn().mockResolvedValue({ url: "https://res.cloudinary.com/x/y.jpg", publicId: "y" }),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

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
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

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
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

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
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

    await expect(service.createProduct(validInput, ACTOR_USER_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("rejects an unknown categoryId", async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx);
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

    await expect(
      service.createProduct(
        { ...validInput, categoryIds: ["nonexistent-category"] },
        ACTOR_USER_ID,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("creates the product, translations, options, variants, and inventory in one transaction on valid input", async () => {
    const tx = makeTxMock();
    const prisma = makePrismaMock(tx);
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

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
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

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
      {
        locale: "sv_SE",
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
        inventoryItem: {
          onHand: 5,
          reserved: 0,
          tracksStock: true,
          isLimitedEdition: false,
          productionTimeDays: null,
        },
        taxClass: { id: "tax-1", code: "STANDARD" },
      },
    ],
    ...overrides,
  };
}

function makeUpdateTxMock() {
  return {
    productTranslation: { upsert: vi.fn().mockResolvedValue({}) },
    productCategory: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    productCollection: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
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
      promotionVariant: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

    const result = await service.list(1, 20);

    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      id: "prod-1",
      status: "DRAFT",
      name: "Virkad tröja",
      variantCount: 1,
      hasActivePromotion: false,
      minEffectivePriceMinor: 29900,
      maxEffectivePriceMinor: 29900,
    });
    expect(vi.mocked(prisma.product.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, orderBy: { updatedAt: "desc" } }),
    );
  });

  // The Products list surfaces the same effective-price.ts result the
  // storefront/cart/checkout/admin-detail already use (task: "Products
  // list should show the promotional price") — covers both the service's
  // batched promotion lookup and mapAdminProductListItem's own min/max
  // effective-price arithmetic, mirroring how mapAdminProduct's own
  // activePromotion field is exercised (there is no separate
  // admin-product.mapper.spec.ts; this mapper is covered through the
  // service, same as its sibling fields).
  it("list shows the effective (post-promotion) price range and hasActivePromotion when a variant is on sale", async () => {
    const prisma = {
      product: {
        findMany: vi.fn().mockResolvedValue([makeAdminProductRow()]),
        count: vi.fn().mockResolvedValue(1),
      },
      promotionVariant: {
        findMany: vi.fn().mockResolvedValue([
          {
            productVariantId: "var-1",
            promotion: {
              id: "promo-1",
              name: "Autumn Sale",
              percentage: 25,
              active: true,
              startsAt: null,
              endsAt: null,
            },
          },
        ]),
      },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

    const result = await service.list(1, 20);

    expect(result.items[0]).toMatchObject({
      minPriceMinor: 29900,
      maxPriceMinor: 29900,
      minEffectivePriceMinor: 22425,
      maxEffectivePriceMinor: 22425,
      hasActivePromotion: true,
    });
  });

  // Admin search (task: "add a proper search function to every important
  // list/table page") — Products must be searchable by name, Article
  // Number, and SKU, all case-insensitive and by partial match.
  describe("list — search (q)", () => {
    it("searches by product name via a translations relation filter", async () => {
      const findMany = vi.fn().mockResolvedValue([makeAdminProductRow()]);
      const queryRaw = vi.fn().mockResolvedValue([]); // no variant matches "mössa" by Article Number/SKU
      const prisma = {
        product: { findMany, count: vi.fn().mockResolvedValue(1) },
        promotionVariant: { findMany: vi.fn().mockResolvedValue([]) },
        $queryRaw: queryRaw,
        $transaction: vi.fn(),
      } as unknown as PrismaService;
      const service = new AdminProductsService(
        prisma,
        new AuditService(prisma),
        makeImageStorageMock(),
      );

      await service.list(1, 20, undefined, "mössa");

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              {
                translations: {
                  some: {
                    OR: [
                      { name: { contains: "mössa", mode: "insensitive" } },
                      { slug: { contains: "mössa", mode: "insensitive" } },
                    ],
                  },
                },
              },
            ],
          },
        }),
      );
    });

    it("searches by Article Number via the raw substring lookup, folded in as an id filter", async () => {
      const findMany = vi.fn().mockResolvedValue([makeAdminProductRow()]);
      const queryRaw = vi.fn().mockResolvedValue([{ productId: "prod-1" }]);
      const prisma = {
        product: { findMany, count: vi.fn().mockResolvedValue(1) },
        promotionVariant: { findMany: vi.fn().mockResolvedValue([]) },
        $queryRaw: queryRaw,
        $transaction: vi.fn(),
      } as unknown as PrismaService;
      const service = new AdminProductsService(
        prisma,
        new AuditService(prisma),
        makeImageStorageMock(),
      );

      await service.list(1, 20, undefined, "100042");

      expect(queryRaw).toHaveBeenCalled();
      const whereArg = findMany.mock.calls[0]![0].where;
      expect(whereArg.OR).toContainEqual({ id: { in: ["prod-1"] } });
    });

    it("searches by SKU via the same raw substring lookup", async () => {
      const findMany = vi.fn().mockResolvedValue([makeAdminProductRow()]);
      const queryRaw = vi.fn().mockResolvedValue([{ productId: "prod-1" }]);
      const prisma = {
        product: { findMany, count: vi.fn().mockResolvedValue(1) },
        promotionVariant: { findMany: vi.fn().mockResolvedValue([]) },
        $queryRaw: queryRaw,
        $transaction: vi.fn(),
      } as unknown as PrismaService;
      const service = new AdminProductsService(
        prisma,
        new AuditService(prisma),
        makeImageStorageMock(),
      );

      await service.list(1, 20, undefined, "SKU-1");

      const whereArg = findMany.mock.calls[0]![0].where;
      expect(whereArg.OR).toContainEqual({ id: { in: ["prod-1"] } });
    });
  });

  it("list filters by status when one is given", async () => {
    const prisma = {
      product: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

    await service.list(1, 20, "ARCHIVED");

    expect(vi.mocked(prisma.product.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "ARCHIVED" } }),
    );
    expect(vi.mocked(prisma.product.count)).toHaveBeenCalledWith({ where: { status: "ARCHIVED" } });
  });

  it("getOne 404s when the product doesn't exist", async () => {
    const prisma = {
      product: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

    await expect(service.getOne("missing")).rejects.toThrow(NotFoundException);
  });

  it("getOne returns every locale's translation content, not resolved to one", async () => {
    const row = makeAdminProductRow({
      translations: [
        {
          locale: "sv_SE",
          name: "Virkad tröja",
          slug: "virkad-troja",
          description: null,
          story: null,
          careInstructions: null,
          materials: null,
          metaTitle: null,
          metaDescription: null,
        },
        {
          locale: "en",
          name: "Crocheted sweater",
          slug: "crocheted-sweater",
          description: null,
          story: null,
          careInstructions: null,
          materials: null,
          metaTitle: null,
          metaDescription: null,
        },
      ],
    });
    const prisma = {
      product: { findUnique: vi.fn().mockResolvedValue(row) },
      promotionVariant: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

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
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

    await expect(service.update("missing", {}, ACTOR_USER_ID)).rejects.toThrow(NotFoundException);
  });

  it("rejects an illegal status transition (e.g. PUBLISHED back to DRAFT)", async () => {
    const prisma = {
      product: {
        findUnique: vi.fn().mockResolvedValue({ id: "prod-1", status: "PUBLISHED", variants: [] }),
      },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

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
      promotionVariant: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

    const result = await service.update(
      "prod-1",
      { status: "PUBLISHED" } as UpdateProductInput,
      ACTOR_USER_ID,
    );

    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PUBLISHED", publishedAt: expect.any(Date) }),
      }),
    );
    expect(result.status).toBe("PUBLISHED");
  });

  it("rejects an illegal status transition out of ARCHIVED (e.g. back to DRAFT)", async () => {
    const prisma = {
      product: {
        findUnique: vi.fn().mockResolvedValue({ id: "prod-1", status: "ARCHIVED", variants: [] }),
      },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

    await expect(
      service.update("prod-1", { status: "DRAFT" } as UpdateProductInput, ACTOR_USER_ID),
    ).rejects.toThrow(ConflictException);
  });

  it("allows the legal ARCHIVED -> PUBLISHED transition without touching publishedAt", async () => {
    const tx = makeUpdateTxMock();
    const finalRow = makeAdminProductRow({ status: "PUBLISHED" });
    const prisma = {
      product: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: "prod-1", status: "ARCHIVED", variants: [] })
          .mockResolvedValueOnce(finalRow),
      },
      promotionVariant: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

    const result = await service.update(
      "prod-1",
      { status: "PUBLISHED" } as UpdateProductInput,
      ACTOR_USER_ID,
    );

    expect(tx.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "PUBLISHED" } }),
    );
    expect(result.status).toBe("PUBLISHED");
  });

  it("rejects a variant id that doesn't belong to this product", async () => {
    const prisma = {
      product: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: "prod-1", status: "DRAFT", variants: [{ id: "var-1" }] }),
      },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

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
      promotionVariant: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

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
      $transaction: vi
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

    await expect(
      service.update(
        "prod-1",
        { translations: [{ locale: "en", name: "X", slug: "taken-slug" }] } as UpdateProductInput,
        ACTOR_USER_ID,
      ),
    ).rejects.toThrow(ConflictException);
  });
});

describe("AdminProductsService.listTaxClasses", () => {
  it("maps rows to id/code/name, ordered by code", async () => {
    const prisma = {
      taxClass: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "tax-1", code: "STANDARD", name: "Standard 25%" }]),
      },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

    const result = await service.listTaxClasses();

    expect(result).toEqual([{ id: "tax-1", code: "STANDARD", name: "Standard 25%" }]);
    expect(vi.mocked(prisma.taxClass.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { code: "asc" } }),
    );
  });

  it("returns an empty array when no tax classes exist", async () => {
    const prisma = {
      taxClass: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

    expect(await service.listTaxClasses()).toEqual([]);
  });
});

function makeImageTxMock() {
  return {
    productImage: {
      create: vi.fn().mockResolvedValue({
        id: "img-1",
        url: "https://res.cloudinary.com/x/y.jpg",
        altTextSv: null,
        altTextEn: null,
        position: 0,
      }),
      update: vi.fn().mockResolvedValue({
        id: "img-1",
        url: "https://res.cloudinary.com/x/y.jpg",
        altTextSv: "En tröja",
        altTextEn: null,
        position: 0,
      }),
      delete: vi.fn().mockResolvedValue({}),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
}

describe("AdminProductsService.uploadImage", () => {
  it("404s when the product doesn't exist", async () => {
    const prisma = {
      product: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

    await expect(
      service.uploadImage(
        "missing",
        { buffer: Buffer.from("x"), mimetype: "image/jpeg" },
        {},
        ACTOR_USER_ID,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it("rejects an unsupported mime type without calling the image storage provider", async () => {
    const imageStorage = makeImageStorageMock();
    const prisma = {
      product: { findUnique: vi.fn().mockResolvedValue({ id: "prod-1" }) },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminProductsService(prisma, new AuditService(prisma), imageStorage);

    await expect(
      service.uploadImage(
        "prod-1",
        { buffer: Buffer.from("x"), mimetype: "image/gif" },
        {},
        ACTOR_USER_ID,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(imageStorage.upload).not.toHaveBeenCalled();
  });

  it("rejects a file over the 5MB limit without calling the image storage provider", async () => {
    const imageStorage = makeImageStorageMock();
    const prisma = {
      product: { findUnique: vi.fn().mockResolvedValue({ id: "prod-1" }) },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminProductsService(prisma, new AuditService(prisma), imageStorage);

    await expect(
      service.uploadImage(
        "prod-1",
        { buffer: Buffer.alloc(5 * 1024 * 1024 + 1), mimetype: "image/jpeg" },
        {},
        ACTOR_USER_ID,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(imageStorage.upload).not.toHaveBeenCalled();
  });

  it("uploads via the image storage provider and creates the row at the next position", async () => {
    const tx = makeImageTxMock();
    const imageStorage = makeImageStorageMock();
    const prisma = {
      product: { findUnique: vi.fn().mockResolvedValue({ id: "prod-1" }) },
      productImage: { aggregate: vi.fn().mockResolvedValue({ _max: { position: 2 } }) },
      $transaction: vi
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new AdminProductsService(prisma, new AuditService(prisma), imageStorage);

    const result = await service.uploadImage(
      "prod-1",
      { buffer: Buffer.from("x"), mimetype: "image/jpeg" },
      { altTextSv: "En tröja" },
      ACTOR_USER_ID,
    );

    expect(imageStorage.upload).toHaveBeenCalledWith(expect.any(Buffer), {
      folder: "products/prod-1",
    });
    expect(tx.productImage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productId: "prod-1",
          position: 3,
          cloudinaryPublicId: "y",
          altTextSv: "En tröja",
          altTextEn: null,
        }),
      }),
    );
    expect(result).toEqual({
      id: "img-1",
      url: "https://res.cloudinary.com/x/y.jpg",
      altTextSv: null,
      altTextEn: null,
      position: 0,
    });
  });
});

describe("AdminProductsService.updateImage", () => {
  it("404s when the image doesn't belong to the given product", async () => {
    const prisma = {
      productImage: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

    await expect(
      service.updateImage("prod-1", "img-1", { altTextSv: "X" }, ACTOR_USER_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it("updates only the provided alt text fields", async () => {
    const tx = makeImageTxMock();
    const prisma = {
      productImage: {
        findFirst: vi
          .fn()
          .mockResolvedValue({
            id: "img-1",
            productId: "prod-1",
            altTextSv: null,
            altTextEn: null,
          }),
      },
      $transaction: vi
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

    const result = await service.updateImage(
      "prod-1",
      "img-1",
      { altTextSv: "En tröja" },
      ACTOR_USER_ID,
    );

    expect(tx.productImage.update).toHaveBeenCalledWith({
      where: { id: "img-1" },
      data: { altTextSv: "En tröja" },
    });
    expect(result.altTextSv).toBe("En tröja");
  });
});

describe("AdminProductsService.reorderImages", () => {
  it("404s when the product doesn't exist", async () => {
    const prisma = {
      product: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

    await expect(service.reorderImages("prod-1", ["img-1"], ACTOR_USER_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it("400s when imageIds omits one of the product's current images", async () => {
    const prisma = {
      product: {
        findUnique: vi.fn().mockResolvedValue({
          id: "prod-1",
          images: [{ id: "img-1" }, { id: "img-2" }],
        }),
      },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

    await expect(service.reorderImages("prod-1", ["img-1"], ACTOR_USER_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("400s when imageIds repeats an id instead of listing each once", async () => {
    const prisma = {
      product: {
        findUnique: vi.fn().mockResolvedValue({
          id: "prod-1",
          images: [{ id: "img-1" }, { id: "img-2" }],
        }),
      },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

    await expect(
      service.reorderImages("prod-1", ["img-1", "img-1"], ACTOR_USER_ID),
    ).rejects.toThrow(BadRequestException);
  });

  it("400s when imageIds includes an id from a different product", async () => {
    const prisma = {
      product: {
        findUnique: vi.fn().mockResolvedValue({
          id: "prod-1",
          images: [{ id: "img-1" }, { id: "img-2" }],
        }),
      },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

    await expect(
      service.reorderImages("prod-1", ["img-1", "img-from-elsewhere"], ACTOR_USER_ID),
    ).rejects.toThrow(BadRequestException);
  });

  it("assigns position from the given order and returns the re-sorted list", async () => {
    const update = vi.fn().mockResolvedValue({});
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "img-2",
        url: "https://res.cloudinary.com/x/b.jpg",
        altTextSv: null,
        altTextEn: null,
        position: 0,
      },
      {
        id: "img-1",
        url: "https://res.cloudinary.com/x/a.jpg",
        altTextSv: null,
        altTextEn: null,
        position: 1,
      },
    ]);
    const auditCreate = vi.fn().mockResolvedValue({});
    const tx = { productImage: { update, findMany }, auditLog: { create: auditCreate } };
    const prisma = {
      product: {
        findUnique: vi.fn().mockResolvedValue({
          id: "prod-1",
          images: [{ id: "img-1" }, { id: "img-2" }],
        }),
      },
      $transaction: vi
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

    const result = await service.reorderImages("prod-1", ["img-2", "img-1"], ACTOR_USER_ID);

    expect(update).toHaveBeenCalledWith({ where: { id: "img-2" }, data: { position: 0 } });
    expect(update).toHaveBeenCalledWith({ where: { id: "img-1" }, data: { position: 1 } });
    expect(result.map((image) => image.id)).toEqual(["img-2", "img-1"]);
  });
});

describe("AdminProductsService.deleteImage", () => {
  it("404s when the image doesn't belong to the given product", async () => {
    const prisma = {
      productImage: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    } as unknown as PrismaService;
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

    await expect(service.deleteImage("prod-1", "img-1", ACTOR_USER_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it("deletes the Cloudinary asset before the DB row", async () => {
    const tx = makeImageTxMock();
    const imageStorage = makeImageStorageMock();
    const prisma = {
      productImage: {
        findFirst: vi.fn().mockResolvedValue({
          id: "img-1",
          productId: "prod-1",
          url: "https://res.cloudinary.com/x/y.jpg",
          cloudinaryPublicId: "y",
        }),
      },
      $transaction: vi
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new AdminProductsService(prisma, new AuditService(prisma), imageStorage);

    await service.deleteImage("prod-1", "img-1", ACTOR_USER_ID);

    expect(imageStorage.delete).toHaveBeenCalledWith("y");
    expect(tx.productImage.delete).toHaveBeenCalledWith({ where: { id: "img-1" } });
  });

  it("skips the Cloudinary call when the row has no stored publicId", async () => {
    const tx = makeImageTxMock();
    const imageStorage = makeImageStorageMock();
    const prisma = {
      productImage: {
        findFirst: vi.fn().mockResolvedValue({
          id: "img-1",
          productId: "prod-1",
          url: "https://res.cloudinary.com/x/y.jpg",
          cloudinaryPublicId: null,
        }),
      },
      $transaction: vi
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new AdminProductsService(prisma, new AuditService(prisma), imageStorage);

    await service.deleteImage("prod-1", "img-1", ACTOR_USER_ID);

    expect(imageStorage.delete).not.toHaveBeenCalled();
    expect(tx.productImage.delete).toHaveBeenCalledWith({ where: { id: "img-1" } });
  });
});

describe("AdminProductsService.deleteProduct", () => {
  it("404s when the product doesn't exist", async () => {
    const prisma = {
      product: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

    await expect(service.deleteProduct("missing", ACTOR_USER_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it("rejects deletion when a variant has an existing order", async () => {
    const prisma = {
      product: {
        findUnique: vi.fn().mockResolvedValue({
          id: "prod-1",
          status: "ARCHIVED",
          variants: [{ id: "var-1" }],
          images: [],
        }),
      },
      orderItem: { count: vi.fn().mockResolvedValue(1) },
      cartItem: { count: vi.fn().mockResolvedValue(0) },
    } as unknown as PrismaService;
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

    await expect(service.deleteProduct("prod-1", ACTOR_USER_ID)).rejects.toThrow(ConflictException);
  });

  it("rejects deletion when a variant is in a live cart, even with no orders", async () => {
    const prisma = {
      product: {
        findUnique: vi.fn().mockResolvedValue({
          id: "prod-1",
          status: "DRAFT",
          variants: [{ id: "var-1" }],
          images: [],
        }),
      },
      orderItem: { count: vi.fn().mockResolvedValue(0) },
      cartItem: { count: vi.fn().mockResolvedValue(1) },
    } as unknown as PrismaService;
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

    await expect(service.deleteProduct("prod-1", ACTOR_USER_ID)).rejects.toThrow(ConflictException);
  });

  it("deletes Cloudinary assets, then the variants, then the product, when nothing blocks it", async () => {
    const tx = {
      productVariant: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      product: { delete: vi.fn().mockResolvedValue({ id: "prod-1" }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const imageStorage = makeImageStorageMock();
    const prisma = {
      product: {
        findUnique: vi.fn().mockResolvedValue({
          id: "prod-1",
          status: "DRAFT",
          variants: [{ id: "var-1" }],
          images: [{ id: "img-1", cloudinaryPublicId: "y" }],
        }),
      },
      orderItem: { count: vi.fn().mockResolvedValue(0) },
      cartItem: { count: vi.fn().mockResolvedValue(0) },
      $transaction: vi
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new AdminProductsService(prisma, new AuditService(prisma), imageStorage);

    await service.deleteProduct("prod-1", ACTOR_USER_ID);

    expect(imageStorage.delete).toHaveBeenCalledWith("y");
    expect(tx.productVariant.deleteMany).toHaveBeenCalledWith({ where: { productId: "prod-1" } });
    expect(tx.product.delete).toHaveBeenCalledWith({ where: { id: "prod-1" } });
  });

  it("skips the order/cart checks entirely for a product with no variants", async () => {
    const tx = {
      productVariant: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      product: { delete: vi.fn().mockResolvedValue({ id: "prod-1" }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const orderItemCount = vi.fn();
    const cartItemCount = vi.fn();
    const prisma = {
      product: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: "prod-1", status: "DRAFT", variants: [], images: [] }),
      },
      orderItem: { count: orderItemCount },
      cartItem: { count: cartItemCount },
      $transaction: vi
        .fn()
        .mockImplementation((callback: (tx: unknown) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new AdminProductsService(
      prisma,
      new AuditService(prisma),
      makeImageStorageMock(),
    );

    await service.deleteProduct("prod-1", ACTOR_USER_ID);

    expect(orderItemCount).not.toHaveBeenCalled();
    expect(cartItemCount).not.toHaveBeenCalled();
    expect(tx.product.delete).toHaveBeenCalledWith({ where: { id: "prod-1" } });
  });
});
