import { z } from "zod";

// Admin shape — every field, both locales' CTA labels, regardless of
// isActive (the admin manages the full list, active or not).
export const adminHeroSlideResponseSchema = z.object({
  id: z.string(),
  imageUrl: z.string(),
  position: z.number().int(),
  isActive: z.boolean(),
  ctaLabelSv: z.string().nullable(),
  ctaLabelEn: z.string().nullable(),
  ctaHref: z.string().nullable(),
});
export type AdminHeroSlideResponse = z.infer<typeof adminHeroSlideResponseSchema>;

export const listAdminHeroSlidesResponseSchema = z.array(adminHeroSlideResponseSchema);

// PATCH .../order returns the full list, re-sorted — same reasoning as
// reorder-product-images.dto.ts's own response: the admin form replaces its
// whole list from this rather than trusting its own optimistic reorder
// matched what the server actually persisted.
export const reorderHeroSlidesResponseSchema = listAdminHeroSlidesResponseSchema;

// Public shape — only ever the currently-active slides, and `ctaLabel`
// already resolved to one string for the requested locale (mirrors how
// products.controller.ts resolves ProductTranslation server-side) rather
// than handing the storefront both bilingual columns to pick from.
export const heroSlideResponseSchema = z.object({
  id: z.string(),
  imageUrl: z.string(),
  ctaLabel: z.string().nullable(),
  ctaHref: z.string().nullable(),
});
export type HeroSlideResponse = z.infer<typeof heroSlideResponseSchema>;

export const listHeroSlidesResponseSchema = z.array(heroSlideResponseSchema);

const homepageSectionKeySchema = z.enum(["hero", "story", "made-to-order", "announcement"]);

// Admin shape — every field, both locales' text columns, regardless of
// whether an admin has ever touched them (null means "still the built-in
// default copy" — the storefront resolves that fallback, not this schema).
export const adminHomepageSectionResponseSchema = z.object({
  key: homepageSectionKeySchema,
  imageUrl: z.string().nullable(),
  eyebrowSv: z.string().nullable(),
  eyebrowEn: z.string().nullable(),
  titleSv: z.string().nullable(),
  titleEn: z.string().nullable(),
  descriptionSv: z.string().nullable(),
  descriptionEn: z.string().nullable(),
  ctaLabelSv: z.string().nullable(),
  ctaLabelEn: z.string().nullable(),
  ctaHref: z.string().nullable(),
});
export type AdminHomepageSectionResponse = z.infer<typeof adminHomepageSectionResponseSchema>;

// Always exactly the three known slots, in a fixed order — this is a small,
// closed set (HomepageSection's own schema comment), not a paginated or
// admin-orderable list.
export const listAdminHomepageSectionsResponseSchema = z.array(adminHomepageSectionResponseSchema);

// Public shape — each bilingual field already resolved to one string for
// the requested locale (mirrors heroSlideResponseSchema's own ctaLabel
// resolution), null wherever an admin hasn't set that field (the storefront
// falls back to its own built-in copy for a null value, same as a null
// imageUrl already falls back to a placeholder).
export const homepageSectionResponseSchema = z.object({
  key: homepageSectionKeySchema,
  imageUrl: z.string().nullable(),
  eyebrow: z.string().nullable(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  ctaLabel: z.string().nullable(),
  ctaHref: z.string().nullable(),
});
export type HomepageSectionResponse = z.infer<typeof homepageSectionResponseSchema>;

// Always exactly the three known slots, in a fixed order — this is a small,
// closed set (HomepageSection's own schema comment), not a paginated or
// admin-orderable list.
export const listHomepageSectionsResponseSchema = z.array(homepageSectionResponseSchema);
