import { z } from "zod";

// Shared between AdminCategoriesController and AdminCollectionsController —
// same shape as every other id-param schema in this codebase
// (product-id.param.ts, user-id.param.ts), generic here since neither
// entity's id has any distinguishing validation.
export const taxonomyIdParamSchema = z.object({ id: z.string().min(1) });
export type TaxonomyIdParam = z.infer<typeof taxonomyIdParamSchema>;
