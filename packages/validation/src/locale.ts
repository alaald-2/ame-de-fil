import { z } from "zod";

// Sweden-only market; "en" is a UI/content locale, not a separate market (DECISIONS.md ADR-021).
export const localeSchema = z.enum(["sv-SE", "en"]);
export type Locale = z.infer<typeof localeSchema>;
export const DEFAULT_LOCALE: Locale = "sv-SE";
