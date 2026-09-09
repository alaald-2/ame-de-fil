import createClient, { type Client } from "openapi-fetch";
import type { paths } from "./generated/api-schema.ts";

export type { paths } from "./generated/api-schema.ts";
export type ApiClient = Client<paths>;

export interface CreateApiClientOptions {
  baseUrl: string;
  credentials?: RequestCredentials;
}

// The single sanctioned way for apps/storefront and apps/admin to reach
// apps/api — fully typed against its real OpenAPI contract (regenerated via
// `pnpm --filter @ame-de-fil/api run export-openapi` then
// `pnpm --filter @ame-de-fil/types run generate`). Neither app may import
// Prisma or talk to PostgreSQL directly (ARCHITECTURE.md §1) — this is the
// only door. `credentials: "include"` by default since auth is cookie-based
// (DECISIONS.md ADR-015) and the apps run on different origins in dev.
export function createApiClient(options: CreateApiClientOptions): ApiClient {
  return createClient<paths>({
    baseUrl: options.baseUrl,
    credentials: options.credentials ?? "include",
  });
}
