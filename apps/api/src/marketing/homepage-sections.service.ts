import { Injectable } from "@nestjs/common";
import { HomepageSectionKey } from "@ame-de-fil/database";
import type { Locale as AppLocale } from "@ame-de-fil/validation";
import { PrismaService } from "../database/prisma.service.ts";
import { mapPublicHomepageSection } from "./mappers/homepage-section.mapper.ts";
import type { HomepageSectionResponse } from "./dto/responses.ts";

// Fixed display order — not derived from any DB ordering, since rows may
// not exist yet at all (HomepageSection's own "upserted on first edit"
// posture) and there's nothing to sort by until they do.
const ALL_KEYS = [
  HomepageSectionKey.HERO,
  HomepageSectionKey.STORY,
  HomepageSectionKey.MADE_TO_ORDER,
  HomepageSectionKey.ANNOUNCEMENT,
] as const;

@Injectable()
export class HomepageSectionsService {
  constructor(private readonly prisma: PrismaService) {}

  // Always returns exactly the three known slots, every field `null` for
  // whichever one has no row yet (or no admin-set value) — the storefront
  // falls back to its own built-in copy/placeholder for a null field, never
  // a 404 or a blank section for an unconfigured slot.
  async list(locale: AppLocale): Promise<HomepageSectionResponse[]> {
    const rows = await this.prisma.homepageSection.findMany();
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return ALL_KEYS.map((key) => mapPublicHomepageSection(byKey.get(key) ?? { key, imageUrl: null }, locale));
  }
}
