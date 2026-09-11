import { z } from "zod";

// startsAt/endsAt follow dashboard-query.dto.ts's own convention
// (z.iso.datetime() strings, parsed to Date in the service) rather than
// z.coerce.date(), for the same reason: keeping the wire format an
// explicit ISO string is what the OpenAPI schema/generated client actually
// documents, instead of a coercion behavior invisible to a client.
export const createPromotionSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    // 1-100, integer only — 0% ("on sale for the same price") and negative/
    // >100% percentages are all rejected here, before any pricing math ever
    // runs (effective-price.ts's computeEffectivePriceMinor only ever
    // receives an already-validated value).
    percentage: z.number().int().min(1).max(100),
    startsAt: z.iso.datetime().optional(),
    endsAt: z.iso.datetime().optional(),
    active: z.boolean().optional().default(true),
    // A promotion with no variants would be inert by construction — the
    // admin UI's own variant picker never submits an empty set, and this
    // is the server-side floor under that.
    variantIds: z.array(z.string().min(1)).min(1),
  })
  .refine((v) => !v.startsAt || !v.endsAt || new Date(v.startsAt) < new Date(v.endsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });
export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;
