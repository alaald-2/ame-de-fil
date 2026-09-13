import type { Locale as AppLocale } from "@ame-de-fil/validation";
import type { AdminHeroSlideResponse, HeroSlideResponse } from "../dto/responses.ts";

interface HeroSlideRow {
  id: string;
  imageUrl: string;
  position: number;
  isActive: boolean;
  ctaLabelSv: string | null;
  ctaLabelEn: string | null;
  ctaHref: string | null;
}

export function mapAdminHeroSlide(slide: HeroSlideRow): AdminHeroSlideResponse {
  return {
    id: slide.id,
    imageUrl: slide.imageUrl,
    position: slide.position,
    isActive: slide.isActive,
    ctaLabelSv: slide.ctaLabelSv,
    ctaLabelEn: slide.ctaLabelEn,
    ctaHref: slide.ctaHref,
  };
}

// A flat bilingual pair, not a translation-table row (this model's own
// schema comment), so resolving "the label for this locale" is a plain
// property pick — no defaultLocale fallback chain like
// mappers/translation.mapper.ts's resolveTranslation, since there's no
// "missing translation row" case here: both columns always exist on the
// same row, either populated or both null.
export function mapPublicHeroSlide(slide: HeroSlideRow, locale: AppLocale): HeroSlideResponse {
  const ctaLabel = locale === "en" ? slide.ctaLabelEn : slide.ctaLabelSv;
  return {
    id: slide.id,
    imageUrl: slide.imageUrl,
    ctaLabel: ctaLabel && slide.ctaHref ? ctaLabel : null,
    ctaHref: ctaLabel && slide.ctaHref ? slide.ctaHref : null,
  };
}
