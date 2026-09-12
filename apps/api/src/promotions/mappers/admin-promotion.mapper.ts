import type { Prisma } from "@ame-de-fil/database";
import type { Locale as AppLocale } from "@ame-de-fil/validation";
import { resolveTranslation } from "../../catalog/mappers/translation.mapper.ts";
import { isPromotionCurrentlyEffective } from "../effective-price.ts";

// One include shape shared by every query that needs a promotion's variant
// list — same "single source of truth for the query shape" rationale as
// catalog/mappers/product.mapper.ts's own PRODUCT_INCLUDE.
export const ADMIN_PROMOTION_INCLUDE = {
  variants: {
    include: {
      variant: { include: { product: { include: { translations: true } } } },
    },
  },
} as const;

export type AdminPromotionWithRelations = Prisma.PromotionGetPayload<{
  include: typeof ADMIN_PROMOTION_INCLUDE;
}>;

export interface PromotionVariantSummary {
  variantId: string;
  articleNumber: number;
  sku: string | null;
  productId: string;
  productName: string;
}

export interface AdminPromotionResponse {
  id: string;
  name: string;
  percentage: number;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  effective: boolean;
  variants: PromotionVariantSummary[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminPromotionListItemResponse {
  id: string;
  name: string;
  percentage: number;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  effective: boolean;
  variantCount: number;
  createdAt: string;
  updatedAt: string;
}

function mapVariantSummary(
  row: AdminPromotionWithRelations["variants"][number],
  requestedLocale: AppLocale,
  defaultLocale: AppLocale,
): PromotionVariantSummary {
  const translation = resolveTranslation(
    row.variant.product.translations,
    requestedLocale,
    defaultLocale,
  );
  return {
    variantId: row.variant.id,
    articleNumber: row.variant.articleNumber,
    sku: row.variant.sku,
    productId: row.variant.product.id,
    productName: translation?.name ?? row.variant.sku ?? String(row.variant.articleNumber),
  };
}

export function mapAdminPromotion(
  promotion: AdminPromotionWithRelations,
  requestedLocale: AppLocale,
  defaultLocale: AppLocale,
  now: Date,
): AdminPromotionResponse {
  return {
    id: promotion.id,
    name: promotion.name,
    percentage: promotion.percentage,
    startsAt: promotion.startsAt?.toISOString() ?? null,
    endsAt: promotion.endsAt?.toISOString() ?? null,
    active: promotion.active,
    effective: isPromotionCurrentlyEffective(promotion, now),
    variants: promotion.variants.map((v) => mapVariantSummary(v, requestedLocale, defaultLocale)),
    createdAt: promotion.createdAt.toISOString(),
    updatedAt: promotion.updatedAt.toISOString(),
  };
}

export function mapAdminPromotionListItem(
  promotion: Prisma.PromotionGetPayload<{ include: { _count: { select: { variants: true } } } }>,
  now: Date,
): AdminPromotionListItemResponse {
  return {
    id: promotion.id,
    name: promotion.name,
    percentage: promotion.percentage,
    startsAt: promotion.startsAt?.toISOString() ?? null,
    endsAt: promotion.endsAt?.toISOString() ?? null,
    active: promotion.active,
    effective: isPromotionCurrentlyEffective(promotion, now),
    variantCount: promotion._count.variants,
    createdAt: promotion.createdAt.toISOString(),
    updatedAt: promotion.updatedAt.toISOString(),
  };
}
