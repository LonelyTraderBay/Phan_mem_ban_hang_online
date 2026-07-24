import { test, expect } from "@playwright/test";

const sessionBootstrap = {
  user: { id: "usr_e2e", display_name: "Người dùng E2E", locale: "vi-VN", timezone: "Asia/Ho_Chi_Minh" },
  tenant: { id: "ten_e2e", name: "Shop E2E", currency: "VND", timezone: "Asia/Ho_Chi_Minh" },
  session: { id: "ses_e2e", version: 1, expires_at: "2099-01-01T00:00:00Z", reauth_required_at: null },
  device: { id: "dev_e2e", trusted: true },
  permissions: [
    "tenant.read",
    "member.read",
    "catalog.read",
    "order.read",
    "ai.use",
    "ai.review",
    "ai.configure",
  ] as string[],
  feature_flags: {} as Record<string, { enabled: boolean }>,
};

const anonymousMe = {
  type: "https://api.ai-sales.local/problems/AUTH_TOKEN_EXPIRED",
  title: "Session expired",
  status: 401,
  code: "AUTH_TOKEN_EXPIRED",
  detail: "Not authenticated",
};

test.describe("auth IdP journey (page.route mocks)", () => {
  test("IdP login lands on authenticated shell", async ({ page }) => {
    let authenticated = false;

    await page.route("**/api/me", (route) => {
      if (authenticated) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(sessionBootstrap),
        });
      }
      return route.fulfill({
        status: 401,
        contentType: "application/problem+json",
        body: JSON.stringify(anonymousMe),
      });
    });

    await page.route("**/api/auth/oidc/start**", (route) => {
      authenticated = true;
      const url = new URL(route.request().url());
      const returnTo = url.searchParams.get("return_to") ?? "/";
      return route.fulfill({
        status: 302,
        headers: {
          Location: `/auth/callback?return_to=${encodeURIComponent(returnTo)}&code=e2e_oidc&state=e2e`,
        },
      });
    });

    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Tiếp tục với IdP" })).toBeVisible();
    await page.getByRole("button", { name: "Tiếp tục với IdP" }).click();

    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText("Tổng quan")).toBeVisible();
    await expect(page.getByText("AI Sales OS")).toBeVisible();
  });
});
