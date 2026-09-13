import { Injectable } from "@nestjs/common";
import { HomepageSectionKey } from "@ame-de-fil/database";
import { PrismaService } from "../database/prisma.service.ts";
import { mapHomepageSection } from "./mappers/homepage-section.mapper.ts";
import type { HomepageSectionResponse } from "./dto/responses.ts";

// Fixed display order — not derived from any DB ordering, since rows may
// not exist yet at all (HomepageSection's own "upserted on first upload"
// posture) and there's nothing to sort by until they do.
const ALL_KEYS = [HomepageSectionKey.STORY, HomepageSectionKey.MADE_TO_ORDER] as const;

@Injectable()
export class HomepageSectionsService {
  constructor(private readonly prisma: PrismaService) {}

  // Always returns exactly the two known slots, `imageUrl: null` for
  // whichever one has no row yet — the storefront falls back to its own
  // placeholder for a null imageUrl, never a 404 for an unconfigured slot.
  async list(): Promise<HomepageSectionResponse[]> {
    const rows = await this.prisma.homepageSection.findMany();
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return ALL_KEYS.map((key) => mapHomepageSection(byKey.get(key) ?? { key, imageUrl: null }));
  }
}
