import { test, expect } from "@playwright/test";

// Placeholder smoke suite (FE-F00-009 step 4) — proves the app boots end-to-end in a real
// browser. The e2e dev server has no backend, so bootstrap resolves to anonymous and protected
// routes redirect to /login (see auth.smoke.spec.ts). Real business-feature journeys land with
// F01+ (spec 18.5).
test.describe("app shell smoke", () => {
  test("boots without a fatal error and applies the route guard", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("renders the not-found route for an unknown path", async ({ page }) => {
    await page.goto("/this-route-does-not-exist");
    await expect(page.getByText("Không tìm thấy trang")).toBeVisible();
  });
});
