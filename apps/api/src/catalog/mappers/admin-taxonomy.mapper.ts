import { Locale as PrismaLocale } from "@ame-de-fil/database";
import { fromPrismaLocale } from "../../common/locale.ts";

// Shared between Category and Collection admin mapping — both are
// structurally identical (schema.prisma), so this is written generically
// against the common shape rather than duplicated per entity. Like
// mappers/admin-product.mapper.ts, this is a genuinely different shape
// from the public mapCategory/mapCollection (mappers/category.mapper.ts,
// collection.mapper.ts), which resolve every translation to *one* locale
// for storefront display — editing needs every locale's content at once.
export interface AdminTaxonomyTranslationInput {
  locale: PrismaLocale;
  name: string;
  slug: string;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}

export interface AdminTaxonomyRow {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  translations: AdminTaxonomyTranslationInput[];
  _count: { products: number };
}

export interface AdminTaxonomyResponse {
  id: string;
  createdAt: string;
  updatedAt: string;
  productCount: number;
  translations: Array<{
    locale: "sv-SE" | "en";
    name: string;
    slug: string;
    description: string | null;
    metaTitle: string | null;
    metaDescription: string | null;
  }>;
}

export interface AdminTaxonomyListItemResponse {
  id: string;
  name: string;
  productCount: number;
  updatedAt: string;
}

export function mapAdminTaxonomy(row: AdminTaxonomyRow): AdminTaxonomyResponse {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    productCount: row._count.products,
    translations: row.translations.map((t) => ({
      locale: fromPrismaLocale(t.locale),
      name: t.name,
      slug: t.slug,
      description: t.description,
      metaTitle: t.metaTitle,
      metaDescription: t.metaDescription,
    })),
  };
}

export function mapAdminTaxonomyListItem(
  row: AdminTaxonomyRow,
  defaultLocale: "sv-SE" | "en",
): AdminTaxonomyListItemResponse {
  const translation =
    row.translations.find((t) => fromPrismaLocale(t.locale) === defaultLocale) ??
    row.translations[0];

  return {
    id: row.id,
    name: translation?.name ?? row.id,
    productCount: row._count.products,
    updatedAt: row.updatedAt.toISOString(),
  };
}
