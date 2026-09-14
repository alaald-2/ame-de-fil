import { HomepageSectionKey } from "@ame-de-fil/database";
import type { Locale as AppLocale } from "@ame-de-fil/validation";
import type { HomepageSectionSlug } from "../dto/homepage-section-key.param.ts";
import type { AdminHomepageSectionResponse, HomepageSectionResponse } from "../dto/responses.ts";

const SLUG_BY_KEY: Record<HomepageSectionKey, HomepageSectionSlug> = {
  [HomepageSectionKey.HERO]: "hero",
  [HomepageSectionKey.STORY]: "story",
  [HomepageSectionKey.MADE_TO_ORDER]: "made-to-order",
  [HomepageSectionKey.ANNOUNCEMENT]: "announcement",
};

interface HomepageSectionRow {
  key: HomepageSectionKey;
  imageUrl: string | null;
  eyebrowSv?: string | null;
  eyebrowEn?: string | null;
  titleSv?: string | null;
  titleEn?: string | null;
  descriptionSv?: string | null;
  descriptionEn?: string | null;
  ctaLabelSv?: string | null;
  ctaLabelEn?: string | null;
  ctaHref?: string | null;
}

export function mapAdminHomepageSection(section: HomepageSectionRow): AdminHomepageSectionResponse {
  return {
    key: SLUG_BY_KEY[section.key],
    imageUrl: section.imageUrl,
    eyebrowSv: section.eyebrowSv ?? null,
    eyebrowEn: section.eyebrowEn ?? null,
    titleSv: section.titleSv ?? null,
    titleEn: section.titleEn ?? null,
    descriptionSv: section.descriptionSv ?? null,
    descriptionEn: section.descriptionEn ?? null,
    ctaLabelSv: section.ctaLabelSv ?? null,
    ctaLabelEn: section.ctaLabelEn ?? null,
    ctaHref: section.ctaHref ?? null,
  };
}

// A flat bilingual pair, not a translation-table row (this model's own
// schema comment), so resolving "the value for this locale" is a plain
// property pick — same reasoning as mappers/hero-slide.mapper.ts's
// mapPublicHeroSlide. `ctaLabel`/`ctaHref` are only ever both-or-neither,
// same "no dangling href with no label" guard that hero slide's own mapper
// applies.
export function mapPublicHomepageSection(
  section: HomepageSectionRow,
  locale: AppLocale,
): HomepageSectionResponse {
  const pick = (sv: string | null | undefined, en: string | null | undefined) =>
    (locale === "en" ? en : sv) ?? null;
  const ctaLabel = pick(section.ctaLabelSv, section.ctaLabelEn);
  const ctaHref = section.ctaHref ?? null;

  return {
    key: SLUG_BY_KEY[section.key],
    imageUrl: section.imageUrl,
    eyebrow: pick(section.eyebrowSv, section.eyebrowEn),
    title: pick(section.titleSv, section.titleEn),
    description: pick(section.descriptionSv, section.descriptionEn),
    ctaLabel: ctaLabel && ctaHref ? ctaLabel : null,
    ctaHref: ctaLabel && ctaHref ? ctaHref : null,
  };
}
