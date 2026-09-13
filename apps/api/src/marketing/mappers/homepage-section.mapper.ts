import { HomepageSectionKey } from "@ame-de-fil/database";
import type { HomepageSectionSlug } from "../dto/homepage-section-key.param.ts";
import type { HomepageSectionResponse } from "../dto/responses.ts";

const SLUG_BY_KEY: Record<HomepageSectionKey, HomepageSectionSlug> = {
  [HomepageSectionKey.STORY]: "story",
  [HomepageSectionKey.MADE_TO_ORDER]: "made-to-order",
};

export function mapHomepageSection(section: {
  key: HomepageSectionKey;
  imageUrl: string | null;
}): HomepageSectionResponse {
  return {
    key: SLUG_BY_KEY[section.key],
    imageUrl: section.imageUrl,
  };
}
