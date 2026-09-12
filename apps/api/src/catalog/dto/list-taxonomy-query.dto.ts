import type { z } from "zod";
import { paginationQuerySchema } from "../../common/dto/pagination.schema.ts";
import { searchQuerySchema } from "../../common/dto/search-query.schema.ts";

// Shared by both admin-categories.controller.ts and
// admin-collections.controller.ts — Category and Collection are
// structurally identical (see admin-taxonomy-table.tsx's own comment), so
// their list query shape is too. `q` matches the taxonomy's own name
// (either locale) — see admin-categories.service.ts/
// admin-collections.service.ts's own list().
export const listTaxonomyQuerySchema = paginationQuerySchema.extend({
  ...searchQuerySchema.shape,
});
export type ListTaxonomyQuery = z.infer<typeof listTaxonomyQuerySchema>;
