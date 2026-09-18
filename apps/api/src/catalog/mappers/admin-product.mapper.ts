import type { Prisma } from "@ame-de-fil/database";
import { fromPrismaLocale } from "../../common/locale.ts";
import { computeAvailability } from "../../common/inventory-availability.ts";
import {
  computeEffectivePriceMinor,
  type ActivePromotionSummary,
} from "../../promotions/effective-price.ts";
import { PRODUCT_INCLUDE } from "./product.mapper.ts";

// The public mapper (product.mapper.ts) resolves every translation/label to
// *one* locale for storefront display — an admin edit form needs every
// locale's content at once, so this is a genuinely different response
// shape, not a thin wrapper. Extends PRODUCT_INCLUDE (the public services'
// own single source of truth for the query shape) rather than duplicating
// it, adding only what admin editing additionally needs: each variant's
// tax class code (never needed publicly — price already includes tax) so
// it can be redisplayed in a form the same way it was accepted on create.
export const ADMIN_PRODUCT_INCLUDE = {
  ...PRODUCT_INCLUDE,
  // PRODUCT_INCLUDE doesn't fetch the product's own declared options catalog
  // at all — the public mapper only ever needs each variant's *selected*
  // option values (via variants.optionValues), never the full set of
  // possible options/values a product declares. Admin editing needs the
  // full catalog (e.g. to offer "pick a value for Color" when adding a
  // variant later), so it's added here, not in the shared public include.
  options: { include: { values: true } },
  variants: {
    include: {
      optionValues: { include: { option: true, optionValue: true } },
      inventoryItem: true,
      taxClass: true,
    },
  },
  images: { orderBy: { position: "asc" } },
} as const;

export type AdminProductWithRelations = Prisma.ProductGetPayload<{
  include: typeof ADMIN_PRODUCT_INCLUDE;
}>;

export interface AdminProductTranslationResponse {
  locale: "sv-SE" | "en";
  name: string;
  slug: string;
  description: string | null;
  story: string | null;
  careInstructions: string | null;
  materials: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

export interface AdminProductOptionValueResponse {
  id: string;
  value: string;
  labelSv: string;
  labelEn: string;
  position: number;
}

export interface AdminProductOptionResponse {
  id: string;
  key: string;
  position: number;
  values: AdminProductOptionValueResponse[];
}

export interface AdminProductVariantResponse {
  id: string;
  articleNumber: number;
  sku: string | null;
  priceMinor: number;
  taxClassCode: string;
  weightGrams: number | null;
  isActive: boolean;
  // key -> selected value slug, e.g. { color: "rust" } — the same shape the
  // create DTO accepts, so a variant read here can be fed straight back
  // into an edit form without the caller re-deriving it from optionValues.
  selectedOptionValues: Record<string, string>;
  inventory: {
    onHand: number;
    reserved: number;
    tracksStock: boolean;
    isLimitedEdition: boolean;
    productionTimeDays: number | null;
    available: boolean;
  } | null;
  // Surfaces the same effective-price.ts result the storefront/cart/
  // checkout already use, so the admin can see (and, via the product page's
  // own "remove promotion" action, detach) whichever Promotion is currently
  // discounting this variant, without leaving Products for the dedicated
  // Promotions area. priceMinor above is never touched by this — it stays
  // the permanent base price exactly as effective-price.ts requires.
  activePromotion: {
    id: string;
    name: string;
    percentage: number;
    effectivePriceMinor: number;
  } | null;
}

export interface AdminProductImageResponse {
  id: string;
  url: string;
  altTextSv: string | null;
  altTextEn: string | null;
  position: number;
}

export interface AdminProductResponse {
  id: string;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  translations: AdminProductTranslationResponse[];
  options: AdminProductOptionResponse[];
  categoryIds: string[];
  collectionIds: string[];
  variants: AdminProductVariantResponse[];
  images: AdminProductImageResponse[];
}

// Also used standalone by AdminProductsService's uploadImage/updateImage,
// which persist and return a single ProductImage row without loading the
// rest of the product.
export function mapAdminProductImage(image: {
  id: string;
  url: string;
  altTextSv: string | null;
  altTextEn: string | null;
  position: number;
}): AdminProductImageResponse {
  return {
    id: image.id,
    url: image.url,
    altTextSv: image.altTextSv,
    altTextEn: image.altTextEn,
    position: image.position,
  };
}

export interface AdminProductListItemResponse {
  id: string;
  status: string;
  name: string;
  variantCount: number;
  minPriceMinor: number | null;
  maxPriceMinor: number | null;
  // The post-promotion range — computeEffectivePriceMinor per variant when
  // it currently has an active promotion, its own priceMinor otherwise.
  // Equal to min/maxPriceMinor whenever nothing on this product is
  // discounted, so the frontend never has to recompute a discount itself
  // (this task's own "don't duplicate the promotion calculation in the
  // admin frontend" requirement) — it just compares the two ranges.
  minEffectivePriceMinor: number | null;
  maxEffectivePriceMinor: number | null;
  hasActivePromotion: boolean;
  updatedAt: string;
}

function mapAdminVariant(
  variant: AdminProductWithRelations["variants"][number],
  promotionsByVariantId: ReadonlyMap<string, ActivePromotionSummary>,
): AdminProductVariantResponse {
  const selectedOptionValues: Record<string, string> = {};
  for (const ov of variant.optionValues) {
    selectedOptionValues[ov.option.key] = ov.optionValue.value;
  }

  const inventory = variant.inventoryItem;
  const promotion = promotionsByVariantId.get(variant.id);

  return {
    id: variant.id,
    articleNumber: variant.articleNumber,
    sku: variant.sku,
    priceMinor: variant.priceMinor,
    taxClassCode: variant.taxClass.code,
    weightGrams: variant.weightGrams,
    isActive: variant.isActive,
    selectedOptionValues,
    activePromotion: promotion
      ? {
          id: promotion.id,
          name: promotion.name,
          percentage: promotion.percentage,
          effectivePriceMinor: computeEffectivePriceMinor(variant.priceMinor, promotion.percentage),
        }
      : null,
    inventory: inventory
      ? {
          onHand: inventory.onHand,
          reserved: inventory.reserved,
          tracksStock: inventory.tracksStock,
          isLimitedEdition: inventory.isLimitedEdition,
          productionTimeDays: inventory.productionTimeDays,
          available: computeAvailability(inventory).available,
        }
      : null,
  };
}

export function mapAdminProduct(
  product: AdminProductWithRelations,
  promotionsByVariantId: ReadonlyMap<string, ActivePromotionSummary>,
): AdminProductResponse {
  return {
    id: product.id,
    status: product.status,
    publishedAt: product.publishedAt?.toISOString() ?? null,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    translations: product.translations.map((t) => ({
      locale: fromPrismaLocale(t.locale),
      name: t.name,
      slug: t.slug,
      description: t.description,
      story: t.story,
      careInstructions: t.careInstructions,
      materials: t.materials,
      metaTitle: t.metaTitle,
      metaDescription: t.metaDescription,
    })),
    options: product.options.map((o) => ({
      id: o.id,
      key: o.key,
      position: o.position,
      values: o.values.map((v) => ({
        id: v.id,
        value: v.value,
        labelSv: v.labelSv,
        labelEn: v.labelEn,
        position: v.position,
      })),
    })),
    categoryIds: product.categories.map((pc) => pc.categoryId),
    collectionIds: product.collections.map((pc) => pc.collectionId),
    variants: product.variants.map((v) => mapAdminVariant(v, promotionsByVariantId)),
    images: product.images.map(mapAdminProductImage),
  };
}

// Lighter-weight than the full detail shape — a list row only needs enough
// to identify and triage a product, not its full editable content.
export function mapAdminProductListItem(
  product: AdminProductWithRelations,
  defaultLocale: "sv-SE" | "en",
  promotionsByVariantId: ReadonlyMap<string, ActivePromotionSummary>,
): AdminProductListItemResponse {
  const translation =
    product.translations.find((t) => fromPrismaLocale(t.locale) === defaultLocale) ??
    product.translations[0];

  const prices = product.variants.map((v) => v.priceMinor);
  const effectivePrices = product.variants.map((v) => {
    const promotion = promotionsByVariantId.get(v.id);
    return promotion
      ? computeEffectivePriceMinor(v.priceMinor, promotion.percentage)
      : v.priceMinor;
  });

  return {
    id: product.id,
    status: product.status,
    name: translation?.name ?? product.id,
    variantCount: product.variants.length,
    minPriceMinor: prices.length > 0 ? Math.min(...prices) : null,
    maxPriceMinor: prices.length > 0 ? Math.max(...prices) : null,
    minEffectivePriceMinor: effectivePrices.length > 0 ? Math.min(...effectivePrices) : null,
    maxEffectivePriceMinor: effectivePrices.length > 0 ? Math.max(...effectivePrices) : null,
    hasActivePromotion: product.variants.some((v) => promotionsByVariantId.has(v.id)),
    updatedAt: product.updatedAt.toISOString(),
  };
}
