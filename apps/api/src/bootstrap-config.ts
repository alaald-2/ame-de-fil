// Shared between main.ts (real bootstrap) and export-openapi.ts (document
// generation) so they can never drift apart — a duplicated prefix string in
// both files is exactly how the generated OpenAPI document ended up with
// paths that didn't match the real runtime routes (caught and fixed while
// building the catalog module).
export const API_PREFIX = "api/v1";
export const API_PREFIX_EXCLUDE = ["health"];

// Swagger UI/JSON exposes the full route map (every path, including
// admin/* endpoints, plus DTO shapes) and — unlike a Nest controller — is
// registered directly on the underlying HTTP adapter, so it never passes
// through the APP_GUARD chain (SessionAuthGuard/PermissionsGuard only wrap
// Nest's own routing, not routes SwaggerModule.setup adds itself).
// Restricting it to non-production environments is the smallest fix that
// closes the public-exposure gap without inventing a new authorization
// concept for a docs-only surface (audit finding, RBAC/security review).
export function shouldExposeApiDocs(nodeEnv: string): boolean {
  return nodeEnv !== "production";
}
