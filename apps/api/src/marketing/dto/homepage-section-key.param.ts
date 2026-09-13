import { z } from "zod";
import { HomepageSectionKey } from "@ame-de-fil/database";

// Kebab-case in the URL (matches this codebase's route-naming convention
// everywhere else — e.g. "hero-slides" itself), mapped to the Prisma enum
// value internally rather than exposing "STORY"/"MADE_TO_ORDER" verbatim
// in the path.
const KEY_BY_SLUG = {
  story: HomepageSectionKey.STORY,
  "made-to-order": HomepageSectionKey.MADE_TO_ORDER,
} as const;
export type HomepageSectionSlug = keyof typeof KEY_BY_SLUG;

export const homepageSectionKeyParamSchema = z.object({
  key: z.enum(["story", "made-to-order"]),
});
export type HomepageSectionKeyParam = z.infer<typeof homepageSectionKeyParamSchema>;

export function toPrismaHomepageSectionKey(slug: HomepageSectionSlug): HomepageSectionKey {
  return KEY_BY_SLUG[slug];
}
