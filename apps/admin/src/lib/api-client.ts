import { createApiClient } from "@ame-de-fil/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

// The only door to apps/api — this app never imports @ame-de-fil/database
// or talks to PostgreSQL directly (ARCHITECTURE.md §1).
export const api = createApiClient({ baseUrl: API_URL });
