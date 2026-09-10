import { test as setup } from "@playwright/test";
import { requireSeedAdminCredentials, loginAsAdmin } from "./helpers";

const STORAGE_STATE_PATH = "e2e/.auth/admin.json";

// Playwright's own documented "authenticate once" pattern — every spec
// besides auth.spec.ts (which deliberately starts from a clean, unauthenticated
// context to test the login flow itself) reuses this saved session instead of
// calling POST /auth/login again. Logging in per-test was hitting the
// backend's real rate limit (5 attempts/minute, RateLimit on the login route)
// once more than a couple of specs ran in parallel — this both fixes that and
// is the correct pattern regardless, since these specs have nothing to do
// with auth itself.
setup("authenticate as the seeded admin", async ({ page }) => {
  requireSeedAdminCredentials();
  await loginAsAdmin(page);
  await page.context().storageState({ path: STORAGE_STATE_PATH });
});
