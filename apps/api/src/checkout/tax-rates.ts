import type { Prisma } from "@ame-de-fil/database";

// Every ProductVariant/TaxClass is expected to have a current rate at all
// times (an admin data-integrity invariant, not a user-facing condition) —
// a missing one throws a plain Error, which AllExceptionsFilter turns into
// a generic 500 with the real cause logged server-side, not a 400 the
// customer could somehow "fix" by resubmitting.
export async function getCurrentTaxRatesByClassId(
  tx: Prisma.TransactionClient,
  taxClassIds: readonly string[],
  now: Date,
): Promise<Map<string, number>> {
  const uniqueIds = [...new Set(taxClassIds)];
  if (uniqueIds.length === 0) return new Map();

  const rows = await tx.taxRate.findMany({
    where: {
      taxClassId: { in: uniqueIds },
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
    },
    orderBy: { validFrom: "desc" },
  });

  const result = new Map<string, number>();
  for (const row of rows) {
    // Rows arrive most-recent-validFrom first; keep only the first (latest
    // currently-valid) rate per tax class.
    if (!result.has(row.taxClassId)) {
      result.set(row.taxClassId, row.ratePercent.toNumber());
    }
  }

  const missing = uniqueIds.filter((id) => !result.has(id));
  if (missing.length > 0) {
    throw new Error(`No current tax rate configured for tax class id(s): ${missing.join(", ")}`);
  }

  return result;
}

// Architectural decision (flagged for review): ShippingMethod has no
// taxClassId of its own in the schema, so shipping's embedded VAT uses
// whatever rate the "STANDARD" TaxClass currently has — the same rate that
// applies to ordinary goods. Sweden does apply the standard 25% rate to
// freight/shipping charges in the general case, so this is a reasonable
// default, but it is a real assumption, not something the schema encodes.
export const SHIPPING_TAX_CLASS_CODE = "STANDARD";

export async function getShippingTaxRatePercent(
  tx: Prisma.TransactionClient,
  now: Date,
): Promise<number> {
  const taxClass = await tx.taxClass.findUnique({ where: { code: SHIPPING_TAX_CLASS_CODE } });
  if (!taxClass) {
    throw new Error(`Shipping VAT tax class "${SHIPPING_TAX_CLASS_CODE}" is not configured`);
  }
  const rates = await getCurrentTaxRatesByClassId(tx, [taxClass.id], now);
  const rate = rates.get(taxClass.id);
  if (rate === undefined) {
    throw new Error(`No current tax rate configured for tax class "${SHIPPING_TAX_CLASS_CODE}"`);
  }
  return rate;
}
