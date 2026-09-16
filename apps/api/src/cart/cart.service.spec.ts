import { describe, expect, it, vi } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ProductStatus, Locale } from "@ame-de-fil/database";
import { CartService } from "./cart.service.ts";
import type { PrismaService } from "../database/prisma.service.ts";

const VARIANT_ACTIVE_IN_STOCK = {
  id: "var-1",
  sku: "SKU-1",
  priceMinor: 29900,
  isActive: true,
  product: { status: ProductStatus.PUBLISHED },
  inventoryItem: {
    tracksStock: true,
    onHand: 10,
    reserved: 2,
    isLimitedEdition: false,
    productionTimeDays: null,
  },
};

const CART_ROW = { id: "cart-1", userId: null, guestToken: "guest-token", currency: "SEK" };

function cartWithItems(items: unknown[]) {
  return { ...CART_ROW, items };
}

function itemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    cartId: "cart-1",
    productVariantId: "var-1",
    quantity: 2,
    variant: {
      id: "var-1",
      sku: "SKU-1",
      priceMinor: 29900,
      inventoryItem: {
        tracksStock: true,
        onHand: 10,
        reserved: 2,
        isLimitedEdition: false,
        productionTimeDays: null,
      },
      product: { translations: [{ locale: Locale.sv_SE, name: "Halsduk" }], images: [] },
      optionValues: [],
    },
    ...overrides,
  };
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  const mock = {
    cart: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue(CART_ROW),
      findUniqueOrThrow: vi.fn().mockResolvedValue(cartWithItems([itemRow()])),
    },
    cartItem: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(itemRow()),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    productVariant: {
      findUnique: vi.fn().mockResolvedValue(VARIANT_ACTIVE_IN_STOCK),
    },
    promotionVariant: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
  return mock as unknown as PrismaService;
}

describe("CartService.getCart", () => {
  it("returns the empty shape when no cart row exists, without creating one", async () => {
    const prisma = makePrisma();
    const service = new CartService(prisma);

    const result = await service.getCart({ guestToken: "guest-token" }, "sv-SE");

    expect(result).toEqual({
      cartId: null,
      items: [],
      itemCount: 0,
      subtotal: { amountMinor: 0, currency: "SEK" },
    });
    expect(prisma.cart.upsert).not.toHaveBeenCalled();
  });

  it("maps an existing cart's items with live-computed totals", async () => {
    const prisma = makePrisma({
      cart: {
        findUnique: vi.fn().mockResolvedValue(cartWithItems([itemRow()])),
        upsert: vi.fn(),
        findUniqueOrThrow: vi.fn(),
      },
    });
    const service = new CartService(prisma);

    const result = await service.getCart({ guestToken: "guest-token" }, "sv-SE");

    expect(result.cartId).toBe("cart-1");
    expect(result.itemCount).toBe(2);
    expect(result.subtotal).toEqual({ amountMinor: 59800, currency: "SEK" });
    expect(result.items[0]).toMatchObject({
      id: "item-1",
      productName: "Halsduk",
      available: true,
      image: null,
      variantLabel: null,
    });
  });

  it("includes the primary image and joined variant label when the variant has both", async () => {
    const prisma = makePrisma({
      cart: {
        findUnique: vi.fn().mockResolvedValue(
          cartWithItems([
            itemRow({
              variant: {
                id: "var-1",
                sku: "SKU-1",
                priceMinor: 29900,
                inventoryItem: {
                  tracksStock: true,
                  onHand: 10,
                  reserved: 2,
                  isLimitedEdition: false,
                  productionTimeDays: null,
                },
                product: {
                  translations: [{ locale: Locale.sv_SE, name: "Halsduk" }],
                  images: [
                    { url: "https://example.test/b.jpg", position: 1, altTextSv: "B", altTextEn: "B-en" },
                    { url: "https://example.test/a.jpg", position: 0, altTextSv: "A", altTextEn: "A-en" },
                  ],
                },
                optionValues: [
                  { option: { key: "color" }, optionValue: { labelSv: "Blå", labelEn: "Blue" } },
                  { option: { key: "size" }, optionValue: { labelSv: "M", labelEn: "M" } },
                ],
              },
            }),
          ]),
        ),
        upsert: vi.fn(),
        findUniqueOrThrow: vi.fn(),
      },
    });
    const service = new CartService(prisma);

    const result = await service.getCart({ guestToken: "guest-token" }, "sv-SE");

    // Lowest `position` wins, not array order — same rule product.mapper.ts's
    // own image-sorting already follows.
    expect(result.items[0]?.image).toEqual({ url: "https://example.test/a.jpg", altText: "A" });
    expect(result.items[0]?.variantLabel).toBe("Blå / M");
  });

  // Promotion domain integration — the cart must never trust a
  // client-supplied price, and must reflect an active promotion the same
  // way checkout eventually will (effective-price.ts is the single source
  // both read from).
  it("uses the active promotion's effective price, not the variant's base price", async () => {
    const prisma = makePrisma({
      cart: {
        findUnique: vi.fn().mockResolvedValue(cartWithItems([itemRow()])),
        upsert: vi.fn(),
        findUniqueOrThrow: vi.fn(),
      },
      promotionVariant: {
        findMany: vi.fn().mockResolvedValue([
          {
            productVariantId: "var-1",
            promotion: {
              id: "promo-1",
              name: "Autumn Sale",
              percentage: 20,
              active: true,
              startsAt: null,
              endsAt: null,
            },
          },
        ]),
      },
    });
    const service = new CartService(prisma);

    const result = await service.getCart({ guestToken: "guest-token" }, "sv-SE");

    // Base 29900, qty 2, 20% off -> unit 23920, line total 47840.
    expect(result.items[0]).toMatchObject({
      unitPrice: { amountMinor: 23920, currency: "SEK" },
      originalUnitPrice: { amountMinor: 29900, currency: "SEK" },
      promotion: { id: "promo-1", name: "Autumn Sale", percentage: 20 },
      lineTotal: { amountMinor: 47840, currency: "SEK" },
    });
    expect(result.subtotal).toEqual({ amountMinor: 47840, currency: "SEK" });
  });

  it("ignores an inactive promotion and falls back to the base price", async () => {
    const prisma = makePrisma({
      cart: {
        findUnique: vi.fn().mockResolvedValue(cartWithItems([itemRow()])),
        upsert: vi.fn(),
        findUniqueOrThrow: vi.fn(),
      },
      promotionVariant: {
        // A real query would already exclude this (promotion.active:
        // false), but exercising the JS-side isPromotionCurrentlyEffective
        // filter directly here means this test still catches a regression
        // even if the query's own filter is ever loosened.
        findMany: vi.fn().mockResolvedValue([
          {
            productVariantId: "var-1",
            promotion: {
              id: "promo-1",
              name: "Ended Sale",
              percentage: 20,
              active: false,
              startsAt: null,
              endsAt: null,
            },
          },
        ]),
      },
    });
    const service = new CartService(prisma);

    const result = await service.getCart({ guestToken: "guest-token" }, "sv-SE");

    expect(result.items[0]).toMatchObject({
      unitPrice: { amountMinor: 29900, currency: "SEK" },
      originalUnitPrice: null,
      promotion: null,
    });
  });
});

describe("CartService.addItem", () => {
  it("rejects a nonexistent variant", async () => {
    const prisma = makePrisma({
      productVariant: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    const service = new CartService(prisma);

    await expect(
      service.addItem(
        { guestToken: "guest-token" },
        { variantId: "missing", quantity: 1 },
        "sv-SE",
      ),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.cart.upsert).not.toHaveBeenCalled();
  });

  it("rejects an inactive variant", async () => {
    const prisma = makePrisma({
      productVariant: {
        findUnique: vi.fn().mockResolvedValue({ ...VARIANT_ACTIVE_IN_STOCK, isActive: false }),
      },
    });
    const service = new CartService(prisma);

    await expect(
      service.addItem({ guestToken: "guest-token" }, { variantId: "var-1", quantity: 1 }, "sv-SE"),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects a variant on an unpublished product", async () => {
    const prisma = makePrisma({
      productVariant: {
        findUnique: vi.fn().mockResolvedValue({
          ...VARIANT_ACTIVE_IN_STOCK,
          product: { status: ProductStatus.DRAFT },
        }),
      },
    });
    const service = new CartService(prisma);

    await expect(
      service.addItem({ guestToken: "guest-token" }, { variantId: "var-1", quantity: 1 }, "sv-SE"),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects an out-of-stock variant", async () => {
    const prisma = makePrisma({
      productVariant: {
        findUnique: vi.fn().mockResolvedValue({
          ...VARIANT_ACTIVE_IN_STOCK,
          inventoryItem: {
            tracksStock: true,
            onHand: 2,
            reserved: 2,
            isLimitedEdition: false,
            productionTimeDays: null,
          },
        }),
      },
    });
    const service = new CartService(prisma);

    await expect(
      service.addItem({ guestToken: "guest-token" }, { variantId: "var-1", quantity: 1 }, "sv-SE"),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.cart.upsert).not.toHaveBeenCalled();
  });

  it("rejects a quantity exceeding available stock, including what's already in the cart", async () => {
    const prisma = makePrisma({
      cartItem: {
        findUnique: vi.fn().mockResolvedValue({ id: "item-1", quantity: 7 }),
        upsert: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    });
    const service = new CartService(prisma);

    // onHand 10 - reserved 2 = 8 available; 7 already in cart + 2 more = 9 > 8
    await expect(
      service.addItem({ guestToken: "guest-token" }, { variantId: "var-1", quantity: 2 }, "sv-SE"),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
  });

  it("creates a cart and item, then returns the freshly-mapped cart", async () => {
    const prisma = makePrisma();
    const service = new CartService(prisma);

    const result = await service.addItem(
      { guestToken: "guest-token" },
      { variantId: "var-1", quantity: 2 },
      "sv-SE",
    );

    expect(prisma.cart.upsert).toHaveBeenCalledWith({
      where: { guestToken: "guest-token" },
      create: { guestToken: "guest-token" },
      update: {},
    });
    expect(prisma.cartItem.upsert).toHaveBeenCalledWith({
      where: { cartId_productVariantId: { cartId: "cart-1", productVariantId: "var-1" } },
      create: { cartId: "cart-1", productVariantId: "var-1", quantity: 2 },
      update: { quantity: { increment: 2 } },
    });
    expect(result.cartId).toBe("cart-1");
  });

  it("allows an unbounded quantity for a made-to-order (tracksStock=false) variant", async () => {
    const prisma = makePrisma({
      productVariant: {
        findUnique: vi.fn().mockResolvedValue({
          ...VARIANT_ACTIVE_IN_STOCK,
          inventoryItem: {
            tracksStock: false,
            onHand: 0,
            reserved: 0,
            isLimitedEdition: false,
            productionTimeDays: 14,
          },
        }),
      },
    });
    const service = new CartService(prisma);

    await expect(
      service.addItem({ guestToken: "guest-token" }, { variantId: "var-1", quantity: 50 }, "sv-SE"),
    ).resolves.toBeDefined();
  });
});

describe("CartService.updateItemQuantity — ownership and availability", () => {
  it("throws NotFoundException when the caller has no cart at all", async () => {
    const prisma = makePrisma();
    const service = new CartService(prisma);

    await expect(
      service.updateItemQuantity({ guestToken: "guest-token" }, "item-1", 3, "sv-SE"),
    ).rejects.toThrow(NotFoundException);
  });

  it("throws NotFoundException when the item doesn't belong to the caller's cart", async () => {
    const prisma = makePrisma({
      cart: {
        findUnique: vi.fn().mockResolvedValue(CART_ROW),
        upsert: vi.fn(),
        findUniqueOrThrow: vi.fn(),
      },
      cartItem: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null), // scoped query found nothing for this cartId
        update: vi.fn(),
        delete: vi.fn(),
      },
    });
    const service = new CartService(prisma);

    await expect(
      service.updateItemQuantity({ guestToken: "guest-token" }, "someone-elses-item", 3, "sv-SE"),
    ).rejects.toThrow(NotFoundException);
  });

  it("rejects a quantity exceeding availability", async () => {
    const prisma = makePrisma({
      cart: {
        findUnique: vi.fn().mockResolvedValue(CART_ROW),
        upsert: vi.fn(),
        findUniqueOrThrow: vi.fn(),
      },
    });
    const service = new CartService(prisma);

    await expect(
      service.updateItemQuantity({ guestToken: "guest-token" }, "item-1", 999, "sv-SE"),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.cartItem.update).not.toHaveBeenCalled();
  });

  it("updates the quantity and returns the refreshed cart", async () => {
    const prisma = makePrisma({
      cart: {
        findUnique: vi.fn().mockResolvedValue(CART_ROW),
        upsert: vi.fn(),
        findUniqueOrThrow: vi.fn().mockResolvedValue(cartWithItems([itemRow({ quantity: 3 })])),
      },
    });
    const service = new CartService(prisma);

    const result = await service.updateItemQuantity(
      { guestToken: "guest-token" },
      "item-1",
      3,
      "sv-SE",
    );

    expect(prisma.cartItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { quantity: 3 },
    });
    expect(result.itemCount).toBe(3);
  });
});

describe("CartService.removeItem — ownership", () => {
  it("throws NotFoundException when the caller has no cart at all", async () => {
    const prisma = makePrisma();
    const service = new CartService(prisma);

    await expect(
      service.removeItem({ guestToken: "guest-token" }, "item-1", "sv-SE"),
    ).rejects.toThrow(NotFoundException);
  });

  it("throws NotFoundException when the item isn't in the caller's cart", async () => {
    const prisma = makePrisma({
      cart: {
        findUnique: vi.fn().mockResolvedValue(CART_ROW),
        upsert: vi.fn(),
        findUniqueOrThrow: vi.fn(),
      },
      cartItem: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
        delete: vi.fn(),
      },
    });
    const service = new CartService(prisma);

    await expect(
      service.removeItem({ guestToken: "guest-token" }, "someone-elses-item", "sv-SE"),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.cartItem.delete).not.toHaveBeenCalled();
  });

  it("deletes the item and returns the refreshed cart", async () => {
    const prisma = makePrisma({
      cart: {
        findUnique: vi.fn().mockResolvedValue(CART_ROW),
        upsert: vi.fn(),
        findUniqueOrThrow: vi.fn().mockResolvedValue(cartWithItems([])),
      },
    });
    const service = new CartService(prisma);

    const result = await service.removeItem({ guestToken: "guest-token" }, "item-1", "sv-SE");

    expect(prisma.cartItem.delete).toHaveBeenCalledWith({ where: { id: "item-1" } });
    expect(result.items).toEqual([]);
  });
});
