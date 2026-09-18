import "server-only";
import { headers } from "next/headers";
import { createApiClient, type ApiClient } from "@ame-de-fil/types";
import { API_URL } from "./env";

// Server Components have no browser cookie jar, so `credentials: "include"`
// (lib/api-client.ts's browser-facing client) does nothing here — the
// incoming request's own Cookie header must be forwarded explicitly on
// every outgoing call instead. Mirrors apps/admin/src/lib/server-api.ts
// exactly (same API, same session cookie) — this app didn't need it until
// now (lib/api-client.ts's own comment: "not needed by anything built in
// this checkpoint"), first real consumer is lib/dal.ts's session check.
export async function getServerApiClient(): Promise<ApiClient> {
  const cookieHeader = (await headers()).get("cookie") ?? "";
  const client = createApiClient({ baseUrl: API_URL });
  client.use({
    onRequest({ request }) {
      request.headers.set("cookie", cookieHeader);
      return request;
    },
  });
  return client;
}
