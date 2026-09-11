// Example content shown in placeholders, not translated UI chrome — these
// exemplify what real content in *that* content locale looks like, so they
// stay fixed per content locale regardless of the admin's own display
// language (an admin viewing a form in Spanish should still see a
// Swedish-sounding example in the sv-SE block, same reasoning as never
// translating customer-entered data). Shared by create-product-form.tsx
// and product-details-form.tsx — same entity, same fields, same examples.
export const PRODUCT_CONTENT_PLACEHOLDERS: Record<
  "sv-SE" | "en",
  {
    name: string;
    description: string;
    story: string;
    careInstructions: string;
    materials: string;
    metaTitle: string;
    metaDescription: string;
  }
> = {
  "sv-SE": {
    name: "t.ex. Virkad tröja",
    description: "En kort beskrivning som kunder ser på produktsidan",
    story: "Inspirationen eller hantverket bakom plagget",
    careInstructions: "t.ex. Handtvättas i kallt vatten, torkas liggande",
    materials: "t.ex. 100% merinoull",
    metaTitle: "Visas i sökresultat (valfritt)",
    metaDescription: "En kort sammanfattning för sökresultat (valfritt)",
  },
  en: {
    name: "e.g. Crocheted sweater",
    description: "A short description customers will see on the product page",
    story: "The inspiration or craftsmanship behind this piece",
    careInstructions: "e.g. Hand wash cold, lay flat to dry",
    materials: "e.g. 100% merino wool",
    metaTitle: "Shown in search results (optional)",
    metaDescription: "A short summary for search results (optional)",
  },
};
