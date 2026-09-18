import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Reuses the "setup" project's saved session (playwright.config.ts /
// auth.setup.ts) rather than logging in per-test — same convention as
// orders.spec.ts/customers.spec.ts.
//
// Read-only coverage only — none of these four views has a mutation to
// exercise (ROADMAP.md's Phase 5 inventory checkpoints are all read-only
// lists), so there's no idempotency concern here unlike orders.spec.ts's
// deliberate omission of the fulfillment/refund flows.
test("inventory overview renders real data, and the tabs navigate between the four sections", async ({
  page,
}) => {
  await page.goto("/inventory");
  await expect(page.getByRole("heading", { name: "Lager", level: 1 })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Produkt" })).toBeVisible();

  // Scoped to the tabs' own nav landmark (aria-label "Lagerflikar"), not a
  // bare page-wide link lookup — the tabs' own "Översikt" (Overview) label
  // is coincidentally identical to the sidebar's "Översikt" (Dashboard)
  // link, and an unscoped locator matches both.
  const tabs = page.getByRole("navigation", { name: "Lagerflikar" });

  await tabs.getByRole("link", { name: "Lågt lager" }).click();
  await expect(page).toHaveURL(/\/inventory\/low-stock$/);
  await expect(page.getByRole("heading", { name: "Lager", level: 1 })).toBeVisible();

  await tabs.getByRole("link", { name: "Reservationer" }).click();
  await expect(page).toHaveURL(/\/inventory\/reservations$/);
  // PENDING-only by design (inventory.service.ts's listReservations default)
  // — real data may legitimately have zero rows at any given moment (every
  // reservation eventually resolves to CONSUMED or EXPIRED), so this
  // asserts either real shape rather than assuming rows exist.
  await expect(
    page
      .getByRole("columnheader", { name: "Order" })
      .or(page.getByText("Inga väntande reservationer")),
  ).toBeVisible();

  await tabs.getByRole("link", { name: "Rörelser" }).click();
  await expect(page).toHaveURL(/\/inventory\/movements$/);
  await expect(page.getByRole("columnheader", { name: "Typ" })).toBeVisible();

  await tabs.getByRole("link", { name: "Översikt" }).click();
  await expect(page).toHaveURL(/\/inventory$/);
});

test("a reservation's order number links to the real order detail page", async ({ page }) => {
  await page.goto("/inventory/reservations");
  const orderLink = page.locator("table a").first();
  if ((await orderLink.count()) === 0)
    test.skip(true, "no pending reservations in this environment");
  await orderLink.click();
  await expect(page).toHaveURL(/\/orders\/[^/]+$/);
});

test("pagination query param renders a consistent page (including a deliberately out-of-range one)", async ({
  page,
}) => {
  await page.goto("/inventory?page=999");
  await expect(page.getByRole("heading", { name: "Lager", level: 1 })).toBeVisible();
  await expect(page.getByText("Inga lagerartiklar ännu")).toBeVisible();
});

test("mobile viewport shows stacked records instead of the desktop table on every tab", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const path of [
    "/inventory",
    "/inventory/low-stock",
    "/inventory/reservations",
    "/inventory/movements",
  ]) {
    await page.goto(path);
    await expect(page.locator("table")).toBeHidden();
  }
});

test("inventory sections have no axe violations at desktop or mobile width", async ({ page }) => {
  await page.goto("/inventory");
  const desktopResults = await new AxeBuilder({ page }).analyze();
  expect(desktopResults.violations).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileResults = await new AxeBuilder({ page }).analyze();
  expect(mobileResults.violations).toEqual([]);
});
