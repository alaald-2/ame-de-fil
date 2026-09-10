import type { Page } from "@playwright/test";

// Requires SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD to name a real bootstrap
// admin already seeded against the running apps/api (see e2e/README.md) —
// shared by every spec that needs a signed-in session, not just auth.spec.ts.
export const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL;
export const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;

export function requireSeedAdminCredentials(): void {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      "SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD must be set to run this spec — see e2e/README.md.",
    );
  }
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("E-post").fill(ADMIN_EMAIL as string);
  await page.getByLabel("Lösenord").fill(ADMIN_PASSWORD as string);
  await page.getByRole("button", { name: "Logga in" }).click();
  await page.waitForURL("/");
}
