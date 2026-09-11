import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Reuses the "setup" project's saved session — same convention as every
// other spec (orders.spec.ts/customers.spec.ts/inventory.spec.ts/
// administration.spec.ts).
//
// Read-only coverage only — create/update/publish/archive mutations are
// verified manually against the live stack instead, same rationale as
// Administration's own precedent: there is no delete-product endpoint (only
// DRAFT -> PUBLISHED -> ARCHIVED, with ARCHIVED -> PUBLISHED as the way
// back), so an automated create would permanently accumulate products with
// no way to remove them again.
//
// Unlike Customers/Users (the signed-in admin's own account guarantees at
// least one real row), nothing guarantees a product exists in every
// environment this suite runs against — the row-navigation assertion below
// tolerates zero rows rather than assuming seed/fixture data.
test("products list renders, and a row (if any exist) navigates to a real detail page", async ({ page }) => {
  await page.goto("/products");
  await expect(page.getByRole("heading", { name: "Produkter", level: 1 })).toBeVisible();

  const rowLink = page.getByRole("link", { name: /^Visa /i }).first();
  if ((await rowLink.count()) === 0) {
    await expect(page.getByText("Inga produkter ännu")).toBeVisible();
    return;
  }

  await rowLink.click();
  await expect(page).toHaveURL(/\/products\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Varianter" })).toBeVisible();
});

test("pagination query param renders a consistent page (including a deliberately out-of-range one)", async ({
  page,
}) => {
  await page.goto("/products?page=999");
  await expect(page.getByRole("heading", { name: "Produkter", level: 1 })).toBeVisible();
  await expect(page.getByText("Inga produkter ännu")).toBeVisible();
});

test("mobile viewport shows stacked records instead of the desktop table", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/products");
  await expect(page.locator("table")).toBeHidden();
});

test("products list and detail (if any product exists) have no axe violations at desktop or mobile width", async ({
  page,
}) => {
  await page.goto("/products");
  const listDesktop = await new AxeBuilder({ page }).analyze();
  expect(listDesktop.violations).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  const listMobile = await new AxeBuilder({ page }).analyze();
  expect(listMobile.violations).toEqual([]);

  await page.setViewportSize({ width: 1280, height: 900 });
  const rowLink = page.getByRole("link", { name: /^Visa /i }).first();
  if ((await rowLink.count()) === 0) return;

  await rowLink.click();
  await expect(page.getByRole("heading", { name: "Varianter" })).toBeVisible();
  const detailDesktop = await new AxeBuilder({ page }).analyze();
  expect(detailDesktop.violations).toEqual([]);
});

// Pure render check, no submission — safe to run repeatedly (unlike an
// actual create, which can't be undone; see this file's own top comment).
test("create product page renders the full form with no axe violations", async ({ page }) => {
  await page.goto("/products/new");
  await expect(page.getByRole("heading", { name: "Skapa en produkt", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Varianter" })).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
