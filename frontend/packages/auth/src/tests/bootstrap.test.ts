import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { server } from "@ai-sales/test-utils/msw/server";
import { createApiClient } from "@ai-sales/api-client";
import type { RuntimeConfig } from "@ai-sales/config";
import { bootstrapSession } from "../bootstrap";

// Absolute base URL: Node's fetch rejects relative URLs (no `location` in the vitest node env).
const config: RuntimeConfig = {
  environment: "local",
  apiBaseUrl: "http://localhost/api",
  sseUrl: "http://localhost/api/events",
  oidcClientId: "test-client",
  releaseVersion: "0.0.0-test",
  buildSha: "test",
  telemetryEnabled: false,
  supportUrl: "http://localhost/support",
};

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("bootstrapSession against the default MSW handlers", () => {
  it("succeeds — the hand-written GET /me override matches sessionBootstrapSchema", async () => {
    const result = await bootstrapSession(createApiClient({ config }));

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.session.tenant.id).toBe("ten_fixture");
    expect(result.session.permissions).toContain("member.read");
    expect(result.session.permissions).toContain("role.manage");
    expect(result.session.session.expires_at).toBe("2099-01-01T00:00:00Z");
  });
});
