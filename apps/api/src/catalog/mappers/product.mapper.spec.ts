import { describe, expect, it } from "vitest";
import { Locale as PrismaLocale } from "@ame-de-fil/database";
import { mapProduct, mapProductVariant, type ProductWithRelations } from "./product.mapper.ts";
import type { ActivePromotionSummary } from "../../promotions/effective-price.ts";

const EMPTY_PROMOTIONS: ReadonlyMap<string, ActivePromotionSummary> = new Map();

function makeProduct(overrides: Partial<ProductWithRelations> = {}): ProductWithRelations {
  return {
    id: "prod-1",
    status: "PUBLISHED",
    createdAt: new Date(),
    updatedAt: new Date(),
    publishedAt: new Date(),
    translations: [
      {
        id: "t-sv",
        productId: "prod-1",
        locale: PrismaLocale.sv_SE,
        name: "Virkad tröja",
        slug: "virkad-troja",
        description: "En varm tröja",
        story: null,
        careInstructions: null,
        materials: null,
        metaTitle: null,
        metaDescription: null,
      },
      {
        id: "t-en",
        productId: "prod-1",
        locale: PrismaLocale.en,
        name: "Crochet sweater",
        slug: "crochet-sweater",
        description: "A warm sweater",
        story: null,
        careInstructions: null,
        materials: null,
        metaTitle: null,
        metaDescription: null,
      },
    ],
    images: [
      {
        id: "img-1",
        productId: "prod-1",
        url: "/a.jpg",
        position: 1,
        altTextSv: "Bild A",
        altTextEn: "Image A",
      },
      {
        id: "img-2",
        productId: "prod-1",
        url: "/b.jpg",
        position: 0,
        altTextSv: "Bild B",
        altTextEn: "Image B",
      },
    ],
    categories: [],
    collections: [],
    variants: [],
    ...overrides,
  } as ProductWithRelations;
}

describe("mapProduct", () => {
  it("maps the requested locale's translation", () => {
    const result = mapProduct(makeProduct(), "en", "sv-SE", EMPTY_PROMOTIONS);
    expect(result?.name).toBe("Crochet sweater");
    expect(result?.slug).toBe("crochet-sweater");
    expect(result?.locale).toBe("en");
  });

  it("falls back to the default locale when the requested translation is missing", () => {
    const product = makeProduct({
      translations: [
        {
          id: "t-sv",
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
    });
    const result = mapProduct(product, "en", "sv-SE", EMPTY_PROMOTIONS);
    expect(result?.locale).toBe("sv-SE");
    expect(result?.name).toBe("Virkad tröja");
  });

  it("returns null when there is no translation in the requested or default locale", () => {
    const product = makeProduct({ translations: [] });
    expect(mapProduct(product, "en", "sv-SE", EMPTY_PROMOTIONS)).toBeNull();
  });

  it("sorts images by position and selects the requested locale's alt text", () => {
    const result = mapProduct(makeProduct(), "sv-SE", "sv-SE", EMPTY_PROMOTIONS);
    expect(result?.images.map((i) => i.url)).toEqual(["/b.jpg", "/a.jpg"]);
    expect(result?.images[0]?.altText).toBe("Bild B");
  });
});

describe("mapProductVariant", () => {
  const baseVariant: ProductWithRelations["variants"][number] = {
    id: "var-1",
    productId: "prod-1",
    sku: "SKU-1",
    priceMinor: 29900,
    currency: "SEK",
    taxClassId: "tax-1",
    weightGrams: 300,
    lengthMm: null,
    widthMm: null,
    heightMm: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    optionValues: [
      {
        productVariantId: "var-1",
        productOptionId: "opt-1",
        productOptionValueId: "val-1",
        option: { id: "opt-1", productId: "prod-1", key: "color", position: 0 },
        optionValue: {
          id: "val-1",
          productOptionId: "opt-1",
          value: "rust",
          labelSv: "Rost",
          labelEn: "Rust",
          position: 0,
        },
      },
    ],
    inventoryItem: {
      id: "inv-1",
      productVariantId: "var-1",
      onHand: 5,
      reserved: 2,
      tracksStock: true,
      productionTimeDays: null,
      isLimitedEdition: false,
      lowStockThreshold: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  it("computes availability from onHand - reserved when stock is tracked", () => {
    const result = mapProductVariant(baseVariant, "en", EMPTY_PROMOTIONS);
    expect(result.available).toBe(true); // 5 - 2 = 3 > 0
  });

  it("is unavailable when onHand - reserved <= 0", () => {
    const variant = {
      ...baseVariant,
      inventoryItem: { ...baseVariant.inventoryItem!, onHand: 2, reserved: 2 },
    };
    expect(mapProductVariant(variant, "en", EMPTY_PROMOTIONS).available).toBe(false);
  });

  it("is always available for made-to-order variants (tracksStock=false), regardless of onHand", () => {
    const variant = {
      ...baseVariant,
      inventoryItem: { ...baseVariant.inventoryItem!, tracksStock: false, onHand: 0, reserved: 0 },
    };
    expect(mapProductVariant(variant, "en", EMPTY_PROMOTIONS).available).toBe(true);
  });

  it("is unavailable when there is no inventory item at all", () => {
    const variant = { ...baseVariant, inventoryItem: null };
    expect(mapProductVariant(variant, "en", EMPTY_PROMOTIONS).available).toBe(false);
  });

  it("selects the option value label in the requested locale", () => {
    expect(mapProductVariant(baseVariant, "sv-SE", EMPTY_PROMOTIONS).options[0]?.label).toBe("Rost");
    expect(mapProductVariant(baseVariant, "en", EMPTY_PROMOTIONS).options[0]?.label).toBe("Rust");
  });

  // Promotion domain integration — the storefront must never show (or
  // charge) the base price when a promotion is currently effective for
  // this variant, and must never mutate priceMinor itself doing so.
  it("shows the discounted price and original price when an active promotion applies", () => {
    const promotions = new Map<string, ActivePromotionSummary>([
      ["var-1", { id: "promo-1", name: "Autumn Sale", percentage: 20 }],
    ]);

    const result = mapProductVariant(baseVariant, "en", promotions);

    expect(result.price).toEqual({ amountMinor: 23920, currency: "SEK" }); // 29900 * 0.8
    expect(result.originalPrice).toEqual({ amountMinor: 29900, currency: "SEK" });
    expect(result.promotion).toEqual({ id: "promo-1", name: "Autumn Sale", percentage: 20 });
    expect(baseVariant.priceMinor).toBe(29900); // never mutated
  });

  it("has no originalPrice/promotion when no promotion applies to this variant", () => {
    const result = mapProductVariant(baseVariant, "en", EMPTY_PROMOTIONS);

    expect(result.price).toEqual({ amountMinor: 29900, currency: "SEK" });
    expect(result.originalPrice).toBeNull();
    expect(result.promotion).toBeNull();
  });
});
