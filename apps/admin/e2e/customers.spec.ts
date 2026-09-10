import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { requireSeedAdminCredentials, loginAsAdmin } from "./helpers";

test.beforeAll(requireSeedAdminCredentials);

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
});

test("customers list renders real data, and the whole row navigates to detail", async ({ page }) => {
  await page.goto("/customers");
  await expect(page.getByRole("heading", { name: "Kunder", level: 1 })).toBeVisible();
  await expect(page.getByText(/registrerade$/)).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "E-post" })).toBeVisible();

  // The signed-in admin itself is always a User row (AdminCustomersService
  // lists every User — no staff/customer split on the schema) — so at
  // least one real row exists regardless of what else is seeded in this
  // environment, unlike an assertion that assumes fixture data.
  const rowLink = page.getByRole("link", { name: /^Visa /i }).first();
  await expect(rowLink).toBeVisible();
  await rowLink.click();
  await expect(page).toHaveURL(/\/customers\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("@");
});

test("pagination query param renders a consistent page (including a deliberately out-of-range one)", async ({
  page,
}) => {
  // Page 999 is certain to be beyond any real total in any environment —
  // this deterministically exercises the empty-state branch without
  // depending on how much fixture data happens to be seeded.
  await page.goto("/customers?page=999");
  await expect(page.getByRole("heading", { name: "Kunder", level: 1 })).toBeVisible();
  await expect(page.getByText("Inga kunder ännu")).toBeVisible();
});

test("mobile viewport shows stacked records instead of the desktop table", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/customers");

  await expect(page.locator("table")).toBeHidden();
  // The mobile record list is a plain <ul> of full-record links (customers-table.tsx).
  await expect(page.locator("ul li a").first()).toBeVisible();
});

test("customers list has no axe violations at desktop or mobile width", async ({ page }) => {
  await page.goto("/customers");
  const desktopResults = await new AxeBuilder({ page }).analyze();
  expect(desktopResults.violations).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileResults = await new AxeBuilder({ page }).analyze();
  expect(mobileResults.violations).toEqual([]);
});
