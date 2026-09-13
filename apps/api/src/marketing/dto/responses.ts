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

// Same shape for both public and admin — unlike hero slides there's no
// isActive/CTA/position to hide or resolve per-locale, just "does this slot
// have an image yet." `key` is the kebab-case slug (see
// homepage-section-key.param.ts), not the raw Prisma enum value.
export const homepageSectionResponseSchema = z.object({
  key: z.enum(["story", "made-to-order"]),
  imageUrl: z.string().nullable(),
});
export type HomepageSectionResponse = z.infer<typeof homepageSectionResponseSchema>;

// Always exactly the two known slots, in a fixed order — this is a small,
// closed set (HomepageSection's own schema comment), not a paginated or
// admin-orderable list.
export const listHomepageSectionsResponseSchema = z.array(homepageSectionResponseSchema);
