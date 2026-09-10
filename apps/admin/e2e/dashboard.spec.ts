import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Reuses the "setup" project's saved session (playwright.config.ts /
// auth.setup.ts) rather than logging in per-test.
test("dashboard renders real overview data", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Översikt", level: 1 })).toBeVisible();
  await expect(page.getByText("Senaste 30 dagarna")).toBeVisible();

  await expect(page.getByRole("heading", { name: "Omsättning" })).toBeVisible();
  await expect(page.getByText("NETTOOMSÄTTNING")).toBeVisible();

  await expect(page.getByRole("heading", { name: "Aktivitet" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ordrar" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Betalningar", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Återbetalningar" })).toBeVisible();

  await expect(page.getByRole("heading", { name: "Kunder" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lager" })).toBeVisible();

  // Real data, either shape is valid depending on environment state — the
  // alerts banner when something needs attention, or the quiet all-clear
  // line when nothing does. Never both, never neither. `role=alert` also
  // matches Next.js's own (empty) route announcer, so filter to one with
  // real text content.
  const hasAlert = await page
    .getByRole("alert")
    .filter({ hasText: /\S/ })
    .isVisible()
    .catch(() => false);
  const hasAllClear = await page
    .getByText("Inga akuta ärenden just nu.")
    .isVisible()
    .catch(() => false);
  expect(hasAlert || hasAllClear).toBe(true);
});

test("dashboard has no axe violations at desktop or mobile width", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Aktivitet" })).toBeVisible();

  const desktopResults = await new AxeBuilder({ page }).analyze();
  expect(desktopResults.violations).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileResults = await new AxeBuilder({ page }).analyze();
  expect(mobileResults.violations).toEqual([]);
});
