import { Prisma } from "@ame-de-fil/database";
import type { PrismaService } from "../database/prisma.service.ts";

// Prisma's declarative `where` only supports exact/range comparisons on an
// Int column (ProductVariant.articleNumber), never `contains` — an admin
// typing a partial Article Number ("0042" while thinking of "100042")
// needs a real substring match, so this casts to text and uses ILIKE via
// raw SQL, the same escape hatch inventory.service.ts's own
// LOW_STOCK_CONDITION already uses for a different Prisma limitation.
// Every admin list search (Products, Inventory's four tabs) that needs
// "does this search term match a variant's Article Number" goes through
// one of these two rather than re-deriving the cast, and both take the
// raw `q` (not a pre-built `%...%` pattern) so a caller can never forget
// to wrap it.
export async function findVariantIdsByArticleNumber(
  prisma: PrismaService,
  q: string,
): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT "id" FROM "ProductVariant" WHERE "articleNumber"::text ILIKE ${`%${q}%`}`,
  );
  return rows.map((row) => row.id);
}

// Same match, rolled up to the owning Product — Products' own list search
// needs "which products have a variant whose Article Number or SKU
// matches," not the variant ids themselves. SKU is folded in here too
// (rather than a separate Prisma relation filter) since it's already the
// same table and the same one-query round trip.
export async function findProductIdsByVariantArticleNumberOrSku(
  prisma: PrismaService,
  q: string,
): Promise<string[]> {
  const pattern = `%${q}%`;
  const rows = await prisma.$queryRaw<{ productId: string }[]>(
    Prisma.sql`SELECT DISTINCT "productId" FROM "ProductVariant" WHERE "articleNumber"::text ILIKE ${pattern} OR "sku" ILIKE ${pattern}`,
  );
  return rows.map((row) => row.productId);
}
