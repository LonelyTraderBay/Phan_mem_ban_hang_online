import { test, expect, type APIRequestContext } from "@playwright/test";

const apiTarget = process.env.E2E_API_TARGET ?? "http://127.0.0.1:3000";
const seedTenantId = "01900000-0000-7000-8000-00000000a100";
const seedActorId = "01900000-0000-7000-8000-00000000b100";

async function apiIsAvailable(request: APIRequestContext) {
  try {
    const response = await request.get(`${apiTarget}/health`, { timeout: 5_000 });
    return response.ok();
  } catch {
    return false;
  }
}

test.describe("catalog against real API", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(process.env.E2E_AGAINST_API !== "1", "Set E2E_AGAINST_API=1 to run live API tests.");
    test.skip(!(await apiIsAvailable(request)), "API health is unavailable; seed/API setup is required.");
  });

  test("GET /api/v1/products accepts seeded header actor context", async ({ request }) => {
    const response = await request.get(`${apiTarget}/api/v1/products`, {
      headers: {
        "x-actor-id": process.env.E2E_ACTOR_ID ?? seedActorId,
        "x-tenant-id": process.env.E2E_TENANT_ID ?? seedTenantId,
        "x-permissions": process.env.E2E_PERMISSIONS ?? "catalog.read",
      },
    });
    const body = await response.text();

    expect(response.status(), body).toBe(200);

    const payload = JSON.parse(body) as { data?: unknown };
    expect(Array.isArray(payload.data), body).toBeTruthy();

    for (const item of payload.data as Array<Record<string, unknown>>) {
      expect(item).toMatchObject({
        id: expect.any(String),
        tenant_id: expect.any(String),
        name: expect.any(String),
        status: expect.any(String),
        version: expect.any(Number),
      });
    }
  });
});
