// Same reasoning as product-content-placeholders.ts: these exemplify real
// content in a *content* locale, so they never follow the admin's own
// display language. Shared by create-taxonomy-dialog.tsx and
// admin-taxonomy-detail-form.tsx — Category and Collection reuse the exact
// same fields, just different example names.
export const TAXONOMY_CONTENT_PLACEHOLDERS: Record<
  "categories" | "collections",
  Record<
    "sv-SE" | "en",
    { name: string; description: string; metaTitle: string; metaDescription: string }
  >
> = {
  categories: {
    "sv-SE": {
      name: "t.ex. Halsdukar",
      description: "En kort beskrivning av den här kategorin (valfritt)",
      metaTitle: "Visas i sökresultat (valfritt)",
      metaDescription: "En kort sammanfattning för sökresultat (valfritt)",
    },
    en: {
      name: "e.g. Scarves",
      description: "A short description of this category (optional)",
      metaTitle: "Shown in search results (optional)",
      metaDescription: "A short summary for search results (optional)",
    },
  },
  collections: {
    "sv-SE": {
      name: "t.ex. Höstkollektion",
      description: "En kort beskrivning av den här kollektionen (valfritt)",
      metaTitle: "Visas i sökresultat (valfritt)",
      metaDescription: "En kort sammanfattning för sökresultat (valfritt)",
    },
    en: {
      name: "e.g. Autumn Collection",
      description: "A short description of this collection (optional)",
      metaTitle: "Shown in search results (optional)",
      metaDescription: "A short summary for search results (optional)",
    },
  },
};
