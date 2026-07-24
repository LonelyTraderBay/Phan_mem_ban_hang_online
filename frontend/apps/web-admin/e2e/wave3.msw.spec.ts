import { test, expect } from "@playwright/test";

const channelId = "00000000-0000-0000-0000-000000000401";

test.describe("Wave 3 READY-MOCK routes", () => {
  test("renders channel health dimensions from the account resource", async ({ page }) => {
    await page.goto(`/channels/${channelId}/health`);

    await expect(page.getByRole("heading", { name: "Sức khỏe kênh" })).toBeVisible();
    await expect(page.getByText("Fanpage Shop ABC").first()).toBeVisible();
    await expect(page.getByText("facebook", { exact: true })).toBeVisible();
    await expect(page.getByText("active", { exact: true })).toBeVisible();
    await expect(page.getByText("ok", { exact: true })).toBeVisible();
  });

  test("keeps order and AI routes readable with the fixture permissions", async ({ page }) => {
    await page.goto("/orders");
    await expect(page.getByText("ord_001", { exact: true })).toBeVisible();

    await page.goto("/ai/logs");
    await expect(page.getByText("Gợi ý trả lời hội thoại #c1", { exact: true })).toBeVisible();
  });
});
