import { test, expect, type APIRequestContext } from "@playwright/test";

const apiTarget = process.env.E2E_API_TARGET ?? "http://127.0.0.1:3000";
const seedTenantId = "01900000-0000-7000-8000-00000000a100";
const seedActorId = "01900000-0000-7000-8000-00000000b100";

function actorHeaders(permissions: string) {
  return {
    "x-actor-id": process.env.E2E_ACTOR_ID ?? seedActorId,
    "x-tenant-id": process.env.E2E_TENANT_ID ?? seedTenantId,
    "x-permissions": process.env.E2E_PERMISSIONS ?? permissions,
  };
}

async function apiIsAvailable(request: APIRequestContext) {
  try {
    const response = await request.get(`${apiTarget}/health`, { timeout: 5_000 });
    return response.ok();
  } catch {
    return false;
  }
}

test.describe("tenant resources against real API", () => {
  test.beforeEach(async ({ request }) => {
    test.skip(process.env.E2E_AGAINST_API !== "1", "Set E2E_AGAINST_API=1 to run live API tests.");
    test.skip(!(await apiIsAvailable(request)), "API health is unavailable; seed/API setup is required.");
  });

  test("GET /api/v1/tenants/current accepts seeded actor", async ({ request }) => {
    const response = await request.get(`${apiTarget}/api/v1/tenants/current`, {
      headers: actorHeaders("tenant.read"),
    });
    const body = await response.text();
    expect(response.status(), body).toBe(200);
    const payload = JSON.parse(body) as { data?: { id?: string; code?: string; name?: string } };
    expect(payload.data?.id).toBeTruthy();
    expect(payload.data?.code).toBeTruthy();
    expect(payload.data?.name).toBeTruthy();
  });

  test("GET /api/v1/orders accepts seeded actor", async ({ request }) => {
    const response = await request.get(`${apiTarget}/api/v1/orders`, {
      headers: actorHeaders("order.read"),
    });
    const body = await response.text();
    expect(response.status(), body).toBe(200);
    const payload = JSON.parse(body) as { data?: unknown };
    expect(Array.isArray(payload.data), body).toBeTruthy();
  });

  test("GET /api/v1/ai/logs accepts seeded actor", async ({ request }) => {
    const response = await request.get(`${apiTarget}/api/v1/ai/logs`, {
      headers: actorHeaders("ai.review"),
    });
    const body = await response.text();
    expect(response.status(), body).toBe(200);
    const payload = JSON.parse(body) as { data?: unknown };
    expect(Array.isArray(payload.data), body).toBeTruthy();
  });

  test("GET /api/v1/conversations accepts seeded actor", async ({ request }) => {
    const response = await request.get(`${apiTarget}/api/v1/conversations`, {
      headers: actorHeaders("conversation.read"),
    });
    const body = await response.text();
    expect(response.status(), body).toBe(200);
    const payload = JSON.parse(body) as { data?: unknown };
    expect(Array.isArray(payload.data), body).toBeTruthy();
  });
});
