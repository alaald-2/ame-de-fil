import { z } from "zod";

// Every field optional (a partial PATCH, same posture as
// catalog/dto/update-product.dto.ts) — startsAt/endsAt are additionally
// nullable so an admin can explicitly clear a previously-set date, not just
// leave it unmentioned to keep it. The refine below only catches the case
// where *both* are present in the same request; the service-level check
// (promotions.service.ts's update()) is the authoritative one, since only
// it knows the existing value being merged against for whichever side
// wasn't included in this request.
export const updatePromotionSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    percentage: z.number().int().min(1).max(100).optional(),
    startsAt: z.iso.datetime().nullable().optional(),
    endsAt: z.iso.datetime().nullable().optional(),
    active: z.boolean().optional(),
    variantIds: z.array(z.string().min(1)).min(1).optional(),
  })
  .refine(
    (v) =>
      v.startsAt === undefined ||
      v.endsAt === undefined ||
      !v.startsAt ||
      !v.endsAt ||
      new Date(v.startsAt) < new Date(v.endsAt),
    { message: "endsAt must be after startsAt", path: ["endsAt"] },
  );
export type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>;
