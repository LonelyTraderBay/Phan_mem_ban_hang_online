import { test, expect } from "@playwright/test";

// Auth smoke (FE-F01). Without MSW worker in Playwright, bootstrap is anonymous —
// protected routes redirect to /login. Authenticated journeys need worker or real API.
test.describe("auth routes smoke", () => {
  test("anonymous user on a protected route is redirected to /login", async ({ page }) => {
    await page.goto("/products");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Đăng nhập để tiếp tục" })).toBeVisible();
  });

  test("login shows IdP primary CTA", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("AI Sales OS")).toBeVisible();
    await expect(page.getByRole("button", { name: "Tiếp tục với IdP" })).toBeVisible();
  });

  test("forgot-password route renders", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.getByRole("heading", { name: "Quên mật khẩu" })).toBeVisible();
  });

  test("2fa without challenge shows expired panel", async ({ page }) => {
    await page.goto("/2fa");
    await expect(page.getByText(/Phiên xác thực không còn hiệu lực/)).toBeVisible();
  });

  test("accept-invite without token shows invalid", async ({ page }) => {
    await page.goto("/accept-invite");
    await expect(page.getByText(/Lời mời không hợp lệ|INVITATION_TOKEN_INVALID/)).toBeVisible();
  });
});
