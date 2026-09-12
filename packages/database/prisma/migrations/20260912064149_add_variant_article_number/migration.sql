-- Hand-written (not a plain Prisma diff): ProductVariant.articleNumber is
-- the new permanent, sequential, numeric business identifier for
-- products/variants. It's deliberately separate from `sku` (now optional —
-- see below) and from `id` (the real primary key, left completely alone;
-- every other table — orders, carts, inventory, promotions — keeps
-- referencing variants by `id`, never by this column). Backed by a
-- dedicated Postgres sequence (not Prisma's own @default(autoincrement()),
-- which always starts at 1) so it can start at 100001 as specified, and so
-- a deleted variant's number is never handed out again — Postgres
-- sequences never reuse a value, including one "lost" to a rolled-back
-- transaction.

-- 1. The sequence, starting where the spec asked.
CREATE SEQUENCE "ProductVariant_articleNumber_seq" START WITH 100001 INCREMENT BY 1;

-- 2. Added nullable first — backfilled below, then locked down — so
--    existing rows are never briefly invalid mid-migration.
ALTER TABLE "ProductVariant" ADD COLUMN "articleNumber" INTEGER;

-- 3. Backfill every existing variant, oldest first (createdAt, then id as a
--    stable tiebreaker) — computed as plain arithmetic over a precomputed
--    row_number rather than by calling nextval() once per row inside the
--    UPDATE, since a bare UPDATE has no guaranteed row-processing order and
--    that would risk assigning numbers out of createdAt order (still
--    unique, but not the meaningful oldest-first numbering an admin would
--    expect for existing catalog data).
WITH ordered AS (
  SELECT id, 100000 + ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, id ASC) AS new_article_number
  FROM "ProductVariant"
)
UPDATE "ProductVariant" pv
SET "articleNumber" = ordered.new_article_number
FROM ordered
WHERE pv.id = ordered.id;

-- 4. Move the sequence past whatever the backfill just used, so the very
--    next INSERT continues the run instead of colliding with a backfilled
--    number. GREATEST keeps this a no-op (starts at 100001, as declared
--    above) on a table with no existing rows.
SELECT setval(
  '"ProductVariant_articleNumber_seq"',
  GREATEST(100000, COALESCE((SELECT MAX("articleNumber") FROM "ProductVariant"), 100000))
);

-- 5. Every row now has a value — safe to require one from here on, and to
--    make new rows self-assign from the sequence. Application code never
--    has to know or supply this value (see ProductVariant's own
--    schema.prisma comment); Prisma's plain `create()` gets it for free.
ALTER TABLE "ProductVariant" ALTER COLUMN "articleNumber" SET NOT NULL;
ALTER TABLE "ProductVariant" ALTER COLUMN "articleNumber" SET DEFAULT nextval('"ProductVariant_articleNumber_seq"');

-- 6. Ties the sequence's lifecycle to the column — the same relationship
--    Prisma's own @default(autoincrement()) sets up automatically, just
--    with the custom start value that generator can't express.
ALTER SEQUENCE "ProductVariant_articleNumber_seq" OWNED BY "ProductVariant"."articleNumber";

-- 7. The uniqueness constraint requested explicitly, independent of `id`.
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_articleNumber_key" UNIQUE ("articleNumber");

-- 8. `sku` becomes optional now that articleNumber is the permanent
--    identifier — it stays a unique *business* code for admins who want
--    one, but is no longer required to create a variant. The existing
--    unique index is untouched: Postgres allows any number of NULLs under
--    a unique constraint, so this never risks a collision.
ALTER TABLE "ProductVariant" ALTER COLUMN "sku" DROP NOT NULL;

-- 9. OrderItem gets the matching two changes: skuSnapshot must follow sku
--    in becoming nullable (a variant with no sku has nothing to snapshot),
--    and articleNumberSnapshot is added to snapshot articleNumber the same
--    way going forward (checkout-cart.ts's buildOrderItemSnapshot).
ALTER TABLE "OrderItem" ALTER COLUMN "skuSnapshot" DROP NOT NULL;
ALTER TABLE "OrderItem" ADD COLUMN "articleNumberSnapshot" INTEGER;

-- 10. Best-effort backfill for existing order history: join back to the
--     (now-numbered) variant while it still exists. Orders whose variant
--     was since deleted keep a null articleNumberSnapshot — there is no
--     data left anywhere to recover that history from, same posture as
--     schema.prisma's own comment on basePriceMinor/promotionId for
--     pre-promotion-feature rows.
UPDATE "OrderItem" oi
SET "articleNumberSnapshot" = pv."articleNumber"
FROM "ProductVariant" pv
WHERE pv.id = oi."productVariantId"
  AND oi."articleNumberSnapshot" IS NULL;
