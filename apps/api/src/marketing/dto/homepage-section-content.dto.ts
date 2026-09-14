import { z } from "zod";

// A plain JSON PATCH body (unlike hero-slide-cta.dto.ts's multipart-shared
// schema — this endpoint never touches the image, that stays the separate
// POST/DELETE .../image routes). Every field is optional and independently
// nullable-via-empty-string: an omitted key leaves that field unchanged, an
// empty string clears it back to null (the storefront's "use the built-in
// default copy" state) — the admin form always sends every field together,
// so in practice this mostly exercises the "set or clear" path, but the
// distinction is kept for the same partial-update flexibility
// updateHeroSlideSchema already gives its own callers.
export const homepageSectionContentSchema = z.object({
  eyebrowSv: z.string().optional(),
  eyebrowEn: z.string().optional(),
  titleSv: z.string().optional(),
  titleEn: z.string().optional(),
  descriptionSv: z.string().optional(),
  descriptionEn: z.string().optional(),
  ctaLabelSv: z.string().optional(),
  ctaLabelEn: z.string().optional(),
  ctaHref: z.string().optional(),
});
export type HomepageSectionContentInput = z.infer<typeof homepageSectionContentSchema>;
