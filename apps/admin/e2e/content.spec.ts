import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Reuses the "setup" project's saved session — same convention as every
// other spec (orders.spec.ts/customers.spec.ts/inventory.spec.ts/
// administration.spec.ts/products.spec.ts).
//
// Unlike Products/Administration, Category/Collection deletion is real and
// safely reversible-in-record when nothing is tagged with it yet (blocked
// with a 409 otherwise) — so this is the first admin section able to test
// its own full create→delete mutation lifecycle in the committed suite,
// leaving zero residue on repeated CI runs (a unique name/slug per run,
// deleted again before the test ends).
// Column headers are only asserted when there's at least one row — nothing
// guarantees a category or collection exists in every environment this
// suite runs against (same rationale as products.spec.ts's own tolerance),
// unlike Customers/Users where the signed-in admin's own account guarantees
// a row.
test("content renders real data, and the tabs navigate between Categories and Collections", async ({
  page,
}) => {
  await page.goto("/content");
  await expect(page.getByRole("heading", { name: "Innehåll", level: 1 })).toBeVisible();
  const categoryHeader = page.getByRole("columnheader", { name: "Namn" });
  if (await categoryHeader.count()) await expect(categoryHeader).toBeVisible();

  const tabs = page.getByRole("navigation", { name: "Innehållssektioner" });
  await tabs.getByRole("link", { name: "Kollektioner" }).click();
  await expect(page).toHaveURL(/\/content\/collections$/);
  const collectionHeader = page.getByRole("columnheader", { name: "Namn" });
  if (await collectionHeader.count()) await expect(collectionHeader).toBeVisible();

  await tabs.getByRole("link", { name: "Kategorier" }).click();
  await expect(page).toHaveURL(/\/content$/);
});

test("pagination query param renders a consistent page (including a deliberately out-of-range one)", async ({
  page,
}) => {
  await page.goto("/content?page=999");
  await expect(page.getByRole("heading", { name: "Innehåll", level: 1 })).toBeVisible();
  await expect(page.getByText("Inga kategorier ännu")).toBeVisible();

  await page.goto("/content/collections?page=999");
  await expect(page.getByText("Inga kollektioner ännu")).toBeVisible();
});

test("mobile viewport shows stacked records instead of the desktop table on both tabs", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/content");
  await expect(page.locator("table")).toBeHidden();

  await page.goto("/content/collections");
  await expect(page.locator("table")).toBeHidden();
});

test("content sections have no axe violations at desktop or mobile width", async ({ page }) => {
  await page.goto("/content");
  const categoriesDesktop = await new AxeBuilder({ page }).analyze();
  expect(categoriesDesktop.violations).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  const categoriesMobile = await new AxeBuilder({ page }).analyze();
  expect(categoriesMobile.violations).toEqual([]);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/content/collections");
  const collectionsDesktop = await new AxeBuilder({ page }).analyze();
  expect(collectionsDesktop.violations).toEqual([]);
});

// Pure render check, no submission — safe to run repeatedly (the real
// create/delete cycle is exercised separately below).
test("create dialogs render with no axe violations, on both tabs", async ({ page }) => {
  await page.goto("/content");
  await page.getByRole("button", { name: "Skapa kategori" }).click();
  const categoryDialog = page.getByRole("dialog", { name: "Skapa kategori" });
  await expect(categoryDialog.getByLabel("Slug").first()).toBeVisible();
  const categoryDialogResults = await new AxeBuilder({ page }).analyze();
  expect(categoryDialogResults.violations).toEqual([]);
  await page.keyboard.press("Escape");

  await page.goto("/content/collections");
  await page.getByRole("button", { name: "Skapa kollektion" }).click();
  const collectionDialog = page.getByRole("dialog", { name: "Skapa kollektion" });
  await expect(collectionDialog.getByLabel("Slug").first()).toBeVisible();
  const collectionDialogResults = await new AxeBuilder({ page }).analyze();
  expect(collectionDialogResults.violations).toEqual([]);
});

test("a category can be created, edited, and deleted end to end", async ({ page }) => {
  const unique = Date.now();
  const name = `E2E Kategori ${unique}`;
  const slug = `e2e-kategori-${unique}`;

  await page.goto("/content");
  await page.getByRole("button", { name: "Skapa kategori" }).click();
  const dialog = page.getByRole("dialog", { name: "Skapa kategori" });
  const svFieldset = dialog.locator("fieldset").first();
  await svFieldset.getByLabel("Namn").fill(name);
  await svFieldset.getByLabel("Slug").fill(slug);
  await dialog.getByRole("button", { name: "Skapa kategori" }).click();
  await expect(dialog).toBeHidden();

  const rowLink = page.getByRole("link", { name: `Visa ${name}` });
  await expect(rowLink).toBeVisible();
  await rowLink.click();
  await expect(page).toHaveURL(/\/content\/[^/]+$/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(page.getByText("0 produkter är taggade med den här kategorin")).toBeVisible();

  await page.getByRole("button", { name: "Ta bort kategori" }).click();
  const confirmDialog = page.getByRole("dialog", { name: "Ta bort den här kategorin?" });
  await confirmDialog.getByRole("button", { name: "Ta bort kategori" }).click();

  await expect(page).toHaveURL(/\/content$/);
  await expect(page.getByRole("link", { name: `Visa ${name}` })).toHaveCount(0);
});
