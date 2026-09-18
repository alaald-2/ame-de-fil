import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Reuses the "setup" project's saved session (playwright.config.ts /
// auth.setup.ts) rather than logging in per-test.
//
// Read-only coverage only — this suite never clicks a fulfillment/refund
// action. Those mutate real Order/Payment rows (and the refund action
// makes a real Stripe test-mode API call), so re-running this suite
// wouldn't be idempotent, and a real external network call has no place in
// an automated test run. The fulfillment/refund flows were verified
// manually against the live stack instead (see the Checkpoint 3 report).
test("orders list renders real data, and the whole row navigates to detail", async ({ page }) => {
  await page.goto("/orders");
  await expect(page.getByRole("heading", { name: "Ordrar", level: 1 })).toBeVisible();
  await expect(page.getByText(/ordrar$/)).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Order" })).toBeVisible();

  const rowLink = page.getByRole("link", { name: /^Visa order /i }).first();
  await expect(rowLink).toBeVisible();
  await rowLink.click();
  await expect(page).toHaveURL(/\/orders\/[^/]+$/);
});

test("order detail renders real order fields", async ({ page }) => {
  await page.goto("/orders");
  await page
    .getByRole("link", { name: /^Visa order /i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/orders\/[^/]+$/);

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Artiklar" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Leveransadress" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Faktureringsadress" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sammanställning" })).toBeVisible();
  await expect(page.getByText("Tillbaka till ordrar")).toBeVisible();
});

test("pagination query param renders a consistent page (including a deliberately out-of-range one)", async ({
  page,
}) => {
  await page.goto("/orders?page=999");
  await expect(page.getByRole("heading", { name: "Ordrar", level: 1 })).toBeVisible();
  await expect(page.getByText("Inga ordrar ännu")).toBeVisible();
});

test("mobile viewport shows stacked records instead of the desktop table", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/orders");

  await expect(page.locator("table")).toBeHidden();
  await expect(page.locator("ul li a").first()).toBeVisible();
});

test("orders list and detail have no axe violations at desktop or mobile width", async ({
  page,
}) => {
  await page.goto("/orders");
  const listDesktop = await new AxeBuilder({ page }).analyze();
  expect(listDesktop.violations).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  const listMobile = await new AxeBuilder({ page }).analyze();
  expect(listMobile.violations).toEqual([]);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page
    .getByRole("link", { name: /^Visa order /i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/orders\/[^/]+$/);
  // Wait past the route's loading.tsx skeleton (no heading by design —
  // it's a placeholder) to the real content before scanning.
  await expect(page.getByRole("heading", { name: "Artiklar" })).toBeVisible();
  const detailDesktop = await new AxeBuilder({ page }).analyze();
  expect(detailDesktop.violations).toEqual([]);
});
