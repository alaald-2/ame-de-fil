import { z } from "zod";

// Deliberately capped (max 50) — a browsing/listing concern, not a business
// decision; keeps a single request from forcing an unbounded DB scan.
// Shared across catalog and inventory (moved here once a second consumer
// needed it, rather than duplicated a second time).
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(50).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
