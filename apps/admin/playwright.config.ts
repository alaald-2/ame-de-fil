import { defineConfig, devices } from "@playwright/test";

const PORT = 3002;
const baseURL = `http://localhost:${PORT}`;

// Bootstrap only (ROADMAP.md/DECISIONS.md ADR-016; TESTING.md §5's "Admin
// login" item 11) — Chromium only for now, matching this checkpoint's single
// smoke test. Cross-browser (WebKit/Firefox) coverage is added alongside the
// real admin flows this unblocks (Customers, Orders, etc.), not invented here
// against a test that doesn't yet exercise anything browser-sensitive.
//
// Requires a real apps/api + Postgres already running (see e2e/README.md)
// with a bootstrap admin seeded via SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD
// (packages/database/prisma/seed.ts) — this is a real end-to-end test
// against the live backend contract, not a mocked one.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
