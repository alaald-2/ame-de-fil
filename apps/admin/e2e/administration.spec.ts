import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Reuses the "setup" project's saved session — same convention as
// orders.spec.ts/customers.spec.ts/inventory.spec.ts.
//
// Read-only coverage only, deliberately — unlike Inventory, this section
// has real mutations (create user, activate/deactivate, assign/remove
// role), but there is no delete-user endpoint at all (ROADMAP.md's own
// "deliberately not built" list for this checkpoint), so a created test
// user can never be cleaned up afterward, only deactivated — running this
// automatically on every CI pass would permanently accumulate junk staff
// accounts with no way back. Same rationale as orders.spec.ts's own
// deliberate omission of the fulfillment/refund flows, one level stronger
// (that suite's actions are at least reversible in effect if not in
// record). Mutation flows were verified manually against the live stack
// instead — see the chat transcript for that pass's results.
test("administration renders real data, and the tabs navigate between Users and Audit log", async ({ page }) => {
  await page.goto("/administration");
  await expect(page.getByRole("heading", { name: "Administration", level: 1 })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "E-post" })).toBeVisible();

  const tabs = page.getByRole("navigation", { name: "Administrationsflikar" });
  await tabs.getByRole("link", { name: "Granskningslogg" }).click();
  await expect(page).toHaveURL(/\/administration\/audit-log$/);
  await expect(page.getByRole("columnheader", { name: "Åtgärd" })).toBeVisible();

  await tabs.getByRole("link", { name: "Användare" }).click();
  await expect(page).toHaveURL(/\/administration$/);
});

test("a user row navigates to a detail page with roles, permissions, and account info", async ({ page }) => {
  await page.goto("/administration");
  const rowLink = page.getByRole("link", { name: /^Visa /i }).first();
  await expect(rowLink).toBeVisible();
  await rowLink.click();

  await expect(page).toHaveURL(/\/administration\/users\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("@");
  await expect(page.getByRole("heading", { name: "Roller" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Faktiska behörigheter" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Konto" })).toBeVisible();
  await expect(page.getByText("Aktiva sessioner")).toBeVisible();
});

test("pagination query param renders a consistent page (including a deliberately out-of-range one)", async ({
  page,
}) => {
  await page.goto("/administration?page=999");
  await expect(page.getByRole("heading", { name: "Administration", level: 1 })).toBeVisible();
  await expect(page.getByText("Inga personalanvändare ännu")).toBeVisible();
});

test("mobile viewport shows stacked records instead of the desktop table on both tabs", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/administration");
  await expect(page.locator("table")).toBeHidden();

  await page.goto("/administration/audit-log");
  await expect(page.locator("table")).toBeHidden();
});

test("administration sections and user detail have no axe violations at desktop or mobile width", async ({
  page,
}) => {
  await page.goto("/administration");
  const usersDesktop = await new AxeBuilder({ page }).analyze();
  expect(usersDesktop.violations).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  const usersMobile = await new AxeBuilder({ page }).analyze();
  expect(usersMobile.violations).toEqual([]);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("link", { name: /^Visa /i }).first().click();
  await expect(page.getByRole("heading", { name: "Roller" })).toBeVisible();
  const detailDesktop = await new AxeBuilder({ page }).analyze();
  expect(detailDesktop.violations).toEqual([]);
});
