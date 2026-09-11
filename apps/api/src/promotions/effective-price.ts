import type { Prisma } from "@ame-de-fil/database";
import type { PrismaService } from "../database/prisma.service.ts";

export interface ActivePromotionSummary {
  id: string;
  name: string;
  percentage: number;
}

export interface EffectiveVariantPrice {
  basePriceMinor: number;
  effectivePriceMinor: number;
  promotion: ActivePromotionSummary | null;
}

// Same rounding convention as checkout/pricing.ts's computeEmbeddedVatMinor
// — plain integer minor-unit arithmetic with Math.round, no Decimal (this
// project treats money as integer minor units everywhere; Decimal only
// ever appears for a stored percent/rate column, converted to a plain
// number at the boundary — see tax-rates.ts). percentage is validated to
// be an integer 1-100 at the DTO boundary (create/update-promotion.dto.ts),
// so this can never be asked to produce a negative price; 100% off lands
// on exactly 0.
export function computeEffectivePriceMinor(basePriceMinor: number, percentage: number): number {
  return Math.round((basePriceMinor * (100 - percentage)) / 100);
}

// One clearly-defined interpretation of the end timestamp, used everywhere
// a promotion's effective window is checked — including the migration's own
// EXCLUDE constraint (promotion_variant_no_overlap: WHERE "activeSnapshot",
// tsrange(..., '[)')), which must agree with this function exactly or the
// database and the application could disagree about what "currently
// effective" means.
export function isPromotionCurrentlyEffective(
  promotion: { active: boolean; startsAt: Date | null; endsAt: Date | null },
  now: Date,
): boolean {
  if (!promotion.active) return false;
  if (promotion.startsAt && now < promotion.startsAt) return false;
  if (promotion.endsAt && now >= promotion.endsAt) return false;
  return true;
}

// Batched, same shape as checkout/tax-rates.ts's getCurrentTaxRatesByClassId
// — one query for every variant a caller needs (a cart's worth of items, a
// checkout, a page of catalog listings), never N+1. Accepts PrismaService
// or an open transaction client so checkout can resolve this inside its own
// transaction, exactly like tax rates are.
//
// Filters by the *live* Promotion.active (not PromotionVariant's own
// activeSnapshot column, which exists purely to let the database EXCLUDE
// constraint enforce non-overlap — see PromotionVariant's schema.prisma
// comment) — this is the actual business truth, kept in sync with the
// snapshot by PromotionsService on every write, but read from the source
// here rather than the copy.
export async function resolveActivePromotionsForVariants(
  client: PrismaService | Prisma.TransactionClient,
  variantIds: readonly string[],
  now: Date,
): Promise<Map<string, ActivePromotionSummary>> {
  const uniqueIds = [...new Set(variantIds)];
  if (uniqueIds.length === 0) return new Map();

  const rows = await client.promotionVariant.findMany({
    where: {
      productVariantId: { in: uniqueIds },
      promotion: { active: true },
    },
    include: { promotion: true },
  });

  const result = new Map<string, ActivePromotionSummary>();
  for (const row of rows) {
    if (!isPromotionCurrentlyEffective(row.promotion, now)) continue;
    // At most one row per variant can ever be currently effective here —
    // enforced by promotion_variant_no_overlap, which forbids two
    // *active* PromotionVariant rows for the same variant from having
    // overlapping date ranges — so a plain Map.set (last-write-wins) is
    // safe, never ambiguous.
    result.set(row.productVariantId, {
      id: row.promotion.id,
      name: row.promotion.name,
      percentage: row.promotion.percentage,
    });
  }
  return result;
}

// The one place a caller combines "what's the base price" with "is there a
// currently-effective promotion" into "what does the customer actually
// pay" — used identically by cart display, storefront catalog/PDP display,
// and checkout's real money calculation, so all three can never disagree.
export function resolveEffectivePrice(
  basePriceMinor: number,
  promotion: ActivePromotionSummary | undefined,
): EffectiveVariantPrice {
  if (!promotion) {
    return { basePriceMinor, effectivePriceMinor: basePriceMinor, promotion: null };
  }
  return {
    basePriceMinor,
    effectivePriceMinor: computeEffectivePriceMinor(basePriceMinor, promotion.percentage),
    promotion,
  };
}
