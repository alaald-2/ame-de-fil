import { z } from "zod";
import { localeSchema } from "@ame-de-fil/validation";

// Shared across catalog and cart (moved here once a second domain needed
// it, rather than duplicated a second time) — no default, since a caller
// forgetting to pass it is more likely a bug than an intent to fall back.
export const localeQuerySchema = z.object({ locale: localeSchema });
export type LocaleQuery = z.infer<typeof localeQuerySchema>;
