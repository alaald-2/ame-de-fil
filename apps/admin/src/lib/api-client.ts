import { createApiClient } from "@ame-de-fil/types";
import { API_URL } from "./env";

// The only door to apps/api — this app never imports @ame-de-fil/database
// or talks to PostgreSQL directly (ARCHITECTURE.md §1).
export const api = createApiClient({ baseUrl: API_URL });
