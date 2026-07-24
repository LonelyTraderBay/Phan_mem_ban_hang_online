import { test, expect } from "@playwright/test";

/**
 * Playwright against real Backend (MSW off, Vite /api → /api/v1).
 * Run: E2E_AGAINST_API=1 pnpm --filter @ai-sales/web-admin run test:e2e:api
 *
 * Slice 1: anonymous session — real GET /me 401 → login redirect.
 * Full IdP login is covered separately in auth.oidc.api.spec.ts when E2E_OIDC=1.
 */
test.describe("auth against real API", () => {
  test("GET /api/v1/me anonymous is 401", async ({ request }) => {
    const apiTarget = process.env.E2E_API_TARGET ?? "http://127.0.0.1:3000";
    const res = await request.get(`${apiTarget}/api/v1/me`);
    const body = await res.text();
    expect(res.status(), body).toBe(401);
  });

  test("anonymous protected route redirects to login (no MSW)", async ({ page }) => {
    await page.goto("/products");
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Đăng nhập để tiếp tục" })).toBeVisible();
  });

  test("login page shows IdP CTA against live bootstrap", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("AI Sales OS")).toBeVisible();
    await expect(page.getByRole("button", { name: "Tiếp tục với IdP" })).toBeVisible();
  });
});

test.describe("catalog against real API", () => {
  test("health is up", async ({ request }) => {
    const apiTarget = process.env.E2E_API_TARGET ?? "http://127.0.0.1:3000";
    const res = await request.get(`${apiTarget}/health`);
    expect(res.ok()).toBeTruthy();
  });

  test("products list without session stays on login", async ({ page }) => {
    await page.goto("/products");
    await expect(page).toHaveURL(/\/login/);
  });
});
