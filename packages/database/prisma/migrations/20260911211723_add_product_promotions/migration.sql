-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "basePriceMinor" INTEGER,
ADD COLUMN     "promotionId" TEXT,
ADD COLUMN     "promotionPercentage" INTEGER;

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "percentage" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionVariant" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "activeSnapshot" BOOLEAN NOT NULL,
    "startsAtSnapshot" TIMESTAMP(3),
    "endsAtSnapshot" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Promotion_active_idx" ON "Promotion"("active");

-- CreateIndex
CREATE INDEX "PromotionVariant_productVariantId_idx" ON "PromotionVariant"("productVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionVariant_promotionId_productVariantId_key" ON "PromotionVariant"("promotionId", "productVariantId");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionVariant" ADD CONSTRAINT "PromotionVariant_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionVariant" ADD CONSTRAINT "PromotionVariant_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: enforce "no two overlapping effective promotions per
-- variant" at the database level. Prisma's schema language can't express an
-- EXCLUDE/gist constraint, so this is appended manually (see
-- PromotionVariant's own schema.prisma comment for the full rationale).
--
-- btree_gist is what lets a GiST index mix a plain equality column
-- ("productVariantId" TEXT, via the "=" operator) with a range-overlap
-- column (tsrange, via "&&") in the same exclusion constraint — without it,
-- GiST only understands range/geometric types natively.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- tsrange (not tstzrange): every DateTime column in this schema is
-- TIMESTAMP(3) *without* time zone (see e.g. "startsAt"/"endsAt" above), so
-- the range type here must match — a tstzrange would silently coerce and
-- defeat the point of an exact overlap check.
--
-- '[)' — inclusive start, exclusive end — is the one interpretation of the
-- end timestamp used everywhere a promotion's effective window is checked
-- (see effective-price.ts's isPromotionCurrentlyEffective: now >= startsAt
-- AND now < endsAt), so the constraint's own overlap test is defined the
-- same way. COALESCE(..., 'infinity') treats a null endsAt as "never ends",
-- matching that same function's treatment of a null endsAt.
--
-- The WHERE clause scopes the constraint to activeSnapshot rows only — an
-- inactive PromotionVariant's date range is allowed to overlap freely with
-- anything, since it can never become effective on its own (matches
-- isPromotionCurrentlyEffective requiring active === true).
ALTER TABLE "PromotionVariant" ADD CONSTRAINT "promotion_variant_no_overlap"
  EXCLUDE USING gist (
    "productVariantId" WITH =,
    tsrange("startsAtSnapshot", COALESCE("endsAtSnapshot", 'infinity'), '[)') WITH &&
  )
  WHERE ("activeSnapshot");
