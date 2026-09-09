import type { z } from "zod";
import { localeQuerySchema, paginationQuerySchema } from "./common.schemas.ts";

// Shared by category-detail and collection-detail — both paginate the
// products within them, on top of the locale they're rendered in.
export const detailWithProductsQuerySchema = localeQuerySchema.extend(paginationQuerySchema.shape);
export type DetailWithProductsQuery = z.infer<typeof detailWithProductsQuerySchema>;
