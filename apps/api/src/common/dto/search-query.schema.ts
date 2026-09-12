import { z } from "zod";

// Shared free-text search param — every admin list endpoint that supports
// search (products, orders, customers, inventory, promotions, users,
// categories, collections) extends this rather than redeclaring an
// equivalent `q` field, so the shape (trimmed, non-empty, capped length)
// can never drift between them. Case-insensitive partial matching is each
// service's own concern (Prisma `contains`/`mode: "insensitive"`, or raw
// SQL for the numeric Article Number columns it can't reach) — this only
// defines the query param itself.
export const searchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional(),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;
