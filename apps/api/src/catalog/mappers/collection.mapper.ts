import type { Locale as AppLocale } from "@ame-de-fil/validation";
import type { Prisma } from "@ame-de-fil/database";
import { resolveTranslation } from "./translation.mapper.ts";

// Additive only — the collections LIST response previously carried no
// imagery at all (Collection has no image field of its own; the detail
// endpoint's richer PRODUCT_INCLUDE already proved products.images is the
// real source). One representative image per linked product, capped, feeds
// the storefront's rolling gallery (design discussion) — no change to how
// products/prices/availability are computed anywhere.
export const COLLECTION_GALLERY_IMAGE_LIMIT = 8;

export type CollectionWithRelations = Prisma.CollectionGetPayload<{
  include: {
    translations: true;
    products: { include: { product: { include: { images: true } } } };
  };
}>;

export interface CollectionGalleryImage {
  url: string;
  altText: string | null;
}

export interface CollectionResponse {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  images: CollectionGalleryImage[];
}

export function mapCollection(
  collection: CollectionWithRelations,
  requestedLocale: AppLocale,
  defaultLocale: AppLocale,
): CollectionResponse | null {
  const t = resolveTranslation(collection.translations, requestedLocale, defaultLocale);
  if (!t) return null;

  // One image per product (its first by position), not every image of
  // every product — variety across the gallery matters more than depth on
  // any single item here.
  const images = collection.products
    .map(({ product }) => [...product.images].sort((a, b) => a.position - b.position)[0])
    .filter((image): image is (typeof collection.products)[number]["product"]["images"][number] => image !== undefined)
    .slice(0, COLLECTION_GALLERY_IMAGE_LIMIT)
    .map((image) => ({
      url: image.url,
      altText: requestedLocale === "sv-SE" ? image.altTextSv : image.altTextEn,
    }));

  return {
    id: collection.id,
    slug: t.slug,
    name: t.name,
    description: t.description,
    metaTitle: t.metaTitle,
    metaDescription: t.metaDescription,
    images,
  };
}
