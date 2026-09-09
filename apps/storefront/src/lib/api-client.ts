import { createApiClient } from "@ame-de-fil/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

// The only door to apps/api (ARCHITECTURE.md §1) — this app never imports
// @ame-de-fil/database or talks to PostgreSQL directly. baseUrl is the bare
// API origin; each call uses the full path exactly as declared in the
// generated OpenAPI types (e.g. "/health") since health is deliberately
// unversioned (DEPLOYMENT.md §5) while everything else sits under /api/v1.
//
// Note: Server Component calls run on this app's own Node server, not the
// browser — forwarding the session cookie from the incoming request onto
// this client's outgoing fetch (for authenticated SSR data) is a real piece
// of work deferred to whichever later phase first needs authenticated
// server-side rendering; not needed by anything built in this checkpoint.
export const api = createApiClient({ baseUrl: API_URL });
