import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { AdminProductsService } from "./admin-products.service.ts";
import type { CreateProductInput } from "./dto/create-product.dto.ts";
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
