import type { z } from "zod";
import { paginationQuerySchema } from "../../common/dto/pagination.schema.ts";
import { searchQuerySchema } from "../../common/dto/search-query.schema.ts";

// `q` matches name (first or last), email, or phone — see
// admin-customers.service.ts's own list().
export const listAdminCustomersQuerySchema = paginationQuerySchema.extend({
  ...searchQuerySchema.shape,
});
export type ListAdminCustomersQuery = z.infer<typeof listAdminCustomersQuerySchema>;
