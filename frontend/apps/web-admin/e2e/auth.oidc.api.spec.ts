import { test, expect, type APIRequestContext, type APIResponse } from "@playwright/test";

const apiTarget = process.env.E2E_API_TARGET ?? "http://127.0.0.1:3000";
const oidcIssuer = (process.env.E2E_OIDC_ISSUER ?? "http://127.0.0.1:9090").replace(/\/$/, "");

async function getIfReachable(
  request: APIRequestContext,
  url: string,
  options: { maxRedirects?: number } = {},
): Promise<APIResponse | null> {
  try {
    return await request.get(url, { timeout: 5_000, ...options });
  } catch {
    return null;
  }
}

test.describe("OIDC against local mock IdP", () => {
  test("completes the browser BFF path when explicitly enabled", async ({ page, request }) => {
    test.setTimeout(60_000);
    test.skip(process.env.E2E_OIDC !== "1", "Set E2E_OIDC=1 to run the live mock-IdP path.");

    const apiHealth = await getIfReachable(request, `${apiTarget}/health`);
    test.skip(!apiHealth?.ok(), "API health is unavailable; start the local API first.");

    const idpHealth = await getIfReachable(request, `${oidcIssuer}/health`);
    test.skip(!idpHealth?.ok(), "Mock IdP health is unavailable; start mock-oidc-server.mjs first.");

    const startResponse = await getIfReachable(
      request,
      `${apiTarget}/api/v1/auth/oidc/start?return_to=%2F`,
      { maxRedirects: 0 },
    );
    test.skip(!startResponse || startResponse.status() !== 302, "OIDC is disabled or not configured on the API.");

    await page.goto("/login");
    await page.getByRole("button", { name: "Tiếp tục với IdP" }).click();

    await page.waitForURL((url) => url.pathname === "/", { timeout: 45_000 });

    await expect
      .poll(async () => {
        const me = await page.request.get("http://localhost:5173/api/me");
        return me.status();
      }, { timeout: 15_000 })
      .toBe(200);

    await expect(page.getByRole("heading", { name: "Tổng quan" })).toBeVisible({ timeout: 20_000 });
  });
});
