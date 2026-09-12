import { test, expect } from "@playwright/test";

// Regression test for "General → Save freezes the screen with no
// navigation" (store-settings-form.tsx's handleSubmit): a genuine network
// failure makes fetch() itself *reject* rather than resolve to
// openapi-fetch's own {error} shape. Before the fix, that rejection was
// never caught, so setIsSubmitting(false) never ran and Save stayed
// permanently disabled/spinning.
//
// Route interception is used here deliberately, unlike the rest of this
// suite (see e2e/README.md's "nothing here is mocked") — a real,
// unmocked backend can return an error *response* on demand, but it can
// never be made to drop the connection outright, which is the one failure
// mode this bug depended on. Every other assertion below still exercises
// the real page against the real backend.
test("Save recovers instead of freezing when the request fails outright", async ({ page }) => {
  await page.goto("/administration/store-settings");

  const saveButton = page.getByRole("button", { name: "Spara" });
  await expect(saveButton).toBeVisible();

  await page.route("**/api/v1/admin/store-settings", (route) => route.abort());

  await saveButton.click();

  // The old bug: this never happened, and the button (with its spinner)
  // stayed disabled forever.
  await expect(page.getByText("Något gick fel. Försök igen.")).toBeVisible();
  await expect(saveButton).toBeEnabled();

  // Recovery isn't just cosmetic — a second attempt (network restored)
  // must actually be able to go through, not just render as "enabled".
  await page.unroute("**/api/v1/admin/store-settings");
  await saveButton.click();
  await expect(page.getByText("Butiksinställningarna har sparats.")).toBeVisible();
});
