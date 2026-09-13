import { z } from "zod";

// Shared by both the multipart upload endpoint's non-file fields and the
// JSON PATCH endpoint — same reasoning as product-image.dto.ts's own
// productImageAltTextSchema (multer parses multipart text fields into
// plain strings on req.body before this ever runs). Every field is
// optional: a slide is valid with no CTA at all (bare imagery), and the
// PATCH endpoint treats an omitted key as "leave unchanged", not "clear".
export const heroSlideCtaSchema = z.object({
  ctaLabelSv: z.string().min(1).optional(),
  ctaLabelEn: z.string().min(1).optional(),
  ctaHref: z.string().min(1).optional(),
});
export type HeroSlideCtaInput = z.infer<typeof heroSlideCtaSchema>;

// PATCH-only: isActive alongside the CTA fields above, all optional so a
// caller can update just one thing (e.g. only toggling isActive) without
// resending everything else.
export const updateHeroSlideSchema = heroSlideCtaSchema.extend({
  isActive: z.boolean().optional(),
});
export type UpdateHeroSlideInput = z.infer<typeof updateHeroSlideSchema>;
