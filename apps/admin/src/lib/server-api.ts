import "server-only";
import { headers } from "next/headers";
import { createApiClient, type ApiClient } from "@ame-de-fil/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

// Server Components have no browser cookie jar, so `credentials: "include"`
// (lib/api-client.ts's browser-facing client) does nothing here — the
// incoming request's own Cookie header must be forwarded explicitly on every
// outgoing call instead. A fresh client per call (not a module-level
// singleton) since the cookie is request-scoped, not a fixed value; the
// middleware hook means every call site just does `client.GET(...)` without
// repeating the header itself.
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
