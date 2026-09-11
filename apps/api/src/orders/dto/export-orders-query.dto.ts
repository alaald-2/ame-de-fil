import { z } from "zod";

// Unlike dashboard-query.dto.ts's optional from/to (which fall back to a
// server-computed "last 30 days"), both are required here — an accounting
// export with no range would dump every order ever placed, which is never
// what's wanted; the admin UI always sends an explicit range (defaulting
// client-side to the current month).
export const exportOrdersQuerySchema = z
  .object({
    from: z.iso.datetime(),
    to: z.iso.datetime(),
  })
  .refine((value) => new Date(value.from).getTime() < new Date(value.to).getTime(), {
    message: `"from" must be strictly before "to"`,
    path: ["from"],
  });
export type ExportOrdersQuery = z.infer<typeof exportOrdersQuerySchema>;
