import { Prisma } from "@ame-de-fil/database";

// Detects the promotion_variant_no_overlap EXCLUDE constraint (migration.sql)
// being violated — the database-level, unbypassable backstop underneath
// findOverlapConflicts()'s own pre-check below. Confirmed live shape for
// this project's @prisma/adapter-pg client (Prisma 7, ADR-009): unlike a
// P2002 unique-constraint violation, an EXCLUDE violation surfaces as
// P2039 with the raw Postgres SQLSTATE (23P01, "exclusion_violation") and
// constraint name nested at meta.driverAdapterError.cause — there is no
// dedicated Prisma error code for this constraint type. Mirrors
// checkout/prisma-errors.ts's isUniqueConstraintViolation in spirit
// (narrow, structural match — never a loose substring check against the
// whole error) but the shape genuinely differs enough (P2039 vs P2002, a
// SQLSTATE instead of a constraint/index name pair) that it isn't a case
// that helper's own logic already covers.
export function isExclusionConstraintViolation(error: unknown, constraintName: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2039") return false;

  const driverAdapterError = error.meta?.["driverAdapterError"] as
    { cause?: { code?: unknown; originalCode?: unknown; message?: unknown } } | undefined;
  const cause = driverAdapterError?.cause;
  if (cause?.code !== "23P01" && cause?.originalCode !== "23P01") return false;

  return typeof cause?.message === "string" && cause.message.includes(constraintName);
}

export const PROMOTION_VARIANT_NO_OVERLAP_CONSTRAINT = "promotion_variant_no_overlap";

// Same "lock in a stable, deterministic order, inside an open transaction"
// discipline as checkout/stock-lock.ts's own SELECT...FOR UPDATE, but keyed
// by an advisory lock rather than a row lock — a brand-new promotion has no
// existing PromotionVariant row yet to lock, so there is nothing to SELECT
// FOR UPDATE. pg_advisory_xact_lock(hashtext(id)) serializes any two
// concurrent create/update calls that touch the same variant id regardless,
// and auto-releases at transaction end (commit or rollback) — no explicit
// unlock needed. Sorting first (like stock-lock.ts) means two transactions
// that both touch variants A and B always acquire the locks in the same
// order, so neither can deadlock the other.
export async function lockVariantsForPromotionWrite(
  tx: Prisma.TransactionClient,
  variantIds: readonly string[],
): Promise<void> {
  const sortedIds = [...new Set(variantIds)].sort();
  for (const id of sortedIds) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
  }
}

export interface OverlapConflict {
  variantId: string;
  conflictingPromotionId: string;
  conflictingPromotionName: string;
}

// [) semantics, same as the EXCLUDE constraint and isPromotionCurrentlyEffective
// — a null bound stands in for "no limit on this side."
function rangesOverlap(
  a: { startsAt: Date | null; endsAt: Date | null },
  b: { startsAt: Date | null; endsAt: Date | null },
): boolean {
  const aStart = a.startsAt ?? MIN_DATE;
  const aEnd = a.endsAt ?? MAX_DATE;
  const bStart = b.startsAt ?? MIN_DATE;
  const bEnd = b.endsAt ?? MAX_DATE;
  return aStart < bEnd && bStart < aEnd;
}

const MIN_DATE = new Date(-8640000000000000);
const MAX_DATE = new Date(8640000000000000);

// Service-level backstop, checked BEFORE attempting the write, while
// holding the advisory locks above — the promotion_variant_no_overlap
// EXCLUDE constraint (migration.sql) is the final, unbypassable layer
// underneath this, but relying on catching that raw constraint violation
// as the *only* check would surface a generic database error instead of a
// clear "conflicts with Autumn Sale (Sep 1-30)" message, and would only
// ever name one conflicting row at a time. Only meaningful to call when the
// promotion being created/updated is itself active=true — an inactive
// promotion can never conflict with anything (mirrors the constraint's own
// WHERE activeSnapshot).
export async function findOverlapConflicts(
  tx: Prisma.TransactionClient,
  variantIds: readonly string[],
  window: { startsAt: Date | null; endsAt: Date | null },
  excludePromotionId: string | undefined,
): Promise<OverlapConflict[]> {
  if (variantIds.length === 0) return [];

  const candidates = await tx.promotionVariant.findMany({
    where: {
      productVariantId: { in: [...new Set(variantIds)] },
      promotion: {
        active: true,
        ...(excludePromotionId ? { id: { not: excludePromotionId } } : {}),
      },
    },
    include: { promotion: true },
  });

  const conflicts: OverlapConflict[] = [];
  for (const row of candidates) {
    if (rangesOverlap(window, { startsAt: row.promotion.startsAt, endsAt: row.promotion.endsAt })) {
      conflicts.push({
        variantId: row.productVariantId,
        conflictingPromotionId: row.promotion.id,
        conflictingPromotionName: row.promotion.name,
      });
    }
  }
  return conflicts;
}
