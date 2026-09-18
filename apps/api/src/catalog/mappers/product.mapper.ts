import type { Locale as AppLocale } from "@ame-de-fil/validation";
import type { Prisma } from "@ame-de-fil/database";
import { resolveTranslation } from "./translation.mapper.ts";
import { fromPrismaLocale } from "../../common/locale.ts";
import { computeAvailability } from "../../common/inventory-availability.ts";
import {
  resolveEffectivePrice,
  type ActivePromotionSummary,
} from "../../promotions/effective-price.ts";

// Single source of truth for "the shape a product query needs" — used as
// the literal `include` clause by every service that queries products
// (ProductsService, CategoriesService, CollectionsService), and to derive
// ProductWithRelations below, so the query and the type can never drift
// apart the way three independently-copied `include` objects could.
export const PRODUCT_INCLUDE = {
  translations: true,
  images: true,
  categories: { include: { category: { include: { translations: true } } } },
  collections: { include: { collection: { include: { translations: true } } } },
  variants: {
    include: {
      optionValues: { include: { option: true, optionValue: true } },
      inventoryItem: true,
    },
  },
} as const;

export type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

export interface ProductVariantResponse {
  id: string;
  articleNumber: number;
  sku: string | null;
  // The effective (post-promotion) price — what the customer actually
  // pays. Was always the base price before the Promotion domain existed;
  // now the authoritative "price to charge/display" field, matching cart's
  // own unitPrice semantics (cart/mappers/cart.mapper.ts).
  price: { amountMinor: number; currency: "SEK" };
  // Only set when a promotion is currently discounting this variant — the
  // base price to show crossed out. Null (not equal to `price`) the rest
  // of the time, so an ordinary line never carries a redundant duplicate.
  originalPrice: { amountMinor: number; currency: "SEK" } | null;
  promotion: ActivePromotionSummary | null;
  weightGrams: number | null;
  options: Array<{ key: string; value: string; label: string }>;
  available: boolean;
  isLimitedEdition: boolean;
  productionTimeDays: number | null;
}

export interface ProductResponse {
  id: string;
  status: string;
  locale: AppLocale;
  name: string;
  slug: string;
  description: string | null;
  story: string | null;
  careInstructions: string | null;
  materials: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  images: Array<{ url: string; altText: string | null; position: number }>;
  categories: Array<{ id: string; slug: string; name: string }>;
  collections: Array<{ id: string; slug: string; name: string }>;
  variants: ProductVariantResponse[];
}

// Availability is read-only here (DECISIONS.md checkpoint scope) — never
// reserved/decremented from a catalog read; that's checkout's job later.
export function mapProductVariant(
  variant: ProductWithRelations["variants"][number],
  locale: AppLocale,
  promotionsByVariantId: ReadonlyMap<string, ActivePromotionSummary>,
): ProductVariantResponse {
  const options = variant.optionValues.map((ov) => ({
    key: ov.option.key,
    value: ov.optionValue.value,
    label: locale === "sv-SE" ? ov.optionValue.labelSv : ov.optionValue.labelEn,
  }));

  const inventory = variant.inventoryItem;
  const { available } = inventory ? computeAvailability(inventory) : { available: false };

  const effective = resolveEffectivePrice(
    variant.priceMinor,
    promotionsByVariantId.get(variant.id),
  );

  return {
    id: variant.id,
    articleNumber: variant.articleNumber,
    sku: variant.sku,
    price: { amountMinor: effective.effectivePriceMinor, currency: "SEK" },
    originalPrice:
      effective.promotion !== null
        ? { amountMinor: effective.basePriceMinor, currency: "SEK" }
        : null,
    promotion: effective.promotion,
    weightGrams: variant.weightGrams,
    options,
    available,
    isLimitedEdition: inventory?.isLimitedEdition ?? false,
    productionTimeDays: inventory?.productionTimeDays ?? null,
  };
}

// Every product-listing service (ProductsService, CategoriesService,
// CollectionsService) needs "every variant id across this page of
// products" as the input to one batched resolveActivePromotionsForVariants
// call — collected here once so the shape of PRODUCT_INCLUDE's variants
// array isn't duplicated across three call sites.
export function collectVariantIds(products: readonly ProductWithRelations[]): string[] {
  return products.flatMap((product) => product.variants.map((v) => v.id));
}

// Returns null when neither the requested nor default locale has a
// translation — the caller (ProductsService) turns that into a 404, since a
// product with zero translations has nothing displayable.
export function mapProduct(
  product: ProductWithRelations,
  requestedLocale: AppLocale,
  defaultLocale: AppLocale,
  promotionsByVariantId: ReadonlyMap<string, ActivePromotionSummary>,
): ProductResponse | null {
  const translation = resolveTranslation(product.translations, requestedLocale, defaultLocale);
  if (!translation) return null;

  const resolvedLocale = fromPrismaLocale(translation.locale);

  const categories = product.categories
    .map((pc) => {
      const t = resolveTranslation(pc.category.translations, requestedLocale, defaultLocale);
      return t ? { id: pc.category.id, slug: t.slug, name: t.name } : null;
    })
    .filter((c): c is { id: string; slug: string; name: string } => c !== null);

  const collections = product.collections
    .map((pc) => {
      const t = resolveTranslation(pc.collection.translations, requestedLocale, defaultLocale);
      return t ? { id: pc.collection.id, slug: t.slug, name: t.name } : null;
    })
    .filter((c): c is { id: string; slug: string; name: string } => c !== null);

  return {
    id: product.id,
    status: product.status,
    locale: resolvedLocale,
    name: translation.name,
    slug: translation.slug,
    description: translation.description,
    story: translation.story,
    careInstructions: translation.careInstructions,
    materials: translation.materials,
    metaTitle: translation.metaTitle,
    metaDescription: translation.metaDescription,
    images: [...product.images]
      .sort((a, b) => a.position - b.position)
      .map((img) => ({
        url: img.url,
        altText: requestedLocale === "sv-SE" ? img.altTextSv : img.altTextEn,
        position: img.position,
      })),
    categories,
    collections,
    variants: product.variants.map((v) =>
      mapProductVariant(v, resolvedLocale, promotionsByVariantId),
    ),
  };
}
