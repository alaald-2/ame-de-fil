// Shared between main.ts (real bootstrap) and export-openapi.ts (document
// generation) so they can never drift apart — a duplicated prefix string in
// both files is exactly how the generated OpenAPI document ended up with
// paths that didn't match the real runtime routes (caught and fixed while
// building the catalog module).
export const API_PREFIX = "api/v1";
export const API_PREFIX_EXCLUDE = ["health"];
