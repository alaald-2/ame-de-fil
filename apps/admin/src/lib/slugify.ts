// Matches the backend's own SLUG_PATTERN exactly (catalog/dto/create-product.dto.ts,
// catalog/dto/taxonomy.dto.ts): lowercase ASCII letters/digits, hyphen-separated,
// no leading/trailing/consecutive hyphens. NFD-decompose first so Swedish
// å/ä/ö (and any other accented character) reduce to their base ASCII
// letter — "Virkad tröja" -> "virkad-troja" — rather than being dropped
// entirely or left invalid.
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
