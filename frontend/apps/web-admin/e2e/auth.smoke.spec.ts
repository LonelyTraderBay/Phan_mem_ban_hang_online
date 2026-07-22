import { test, expect } from "@playwright/test";

// Auth smoke skeleton (F00→F01 prep). The e2e dev server runs without a backend, so
// bootstrapSession() resolves to anonymous — these tests pin the anonymous journey.
// The authenticated journey (MSW worker or real backend) lands with F01.
test.describe("auth routes smoke", () => {
  test("anonymous user on a protected route is redirected to /login", async ({ page }) => {
    await page.goto("/products");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Auth route placeholder" })).toBeVisible();
  });

  for (const path of ["/login", "/auth/callback", "/2fa", "/forgot-password", "/reset-password", "/accept-invite"]) {
    test(`auth placeholder route ${path} is registered`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "Auth route placeholder" })).toBeVisible();
    });
  }
});
