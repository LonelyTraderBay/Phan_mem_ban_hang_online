import { describe, expect, it } from "vitest";
import { MissingSecurityContextError } from "@ai-sales/security";
import { securityContextFromHeaders } from "./walking-skeleton-security-context.js";

describe("walking-skeleton securityContextFromHeaders", () => {
  const valid = {
    "x-tenant-id": "018f65fd-7c6b-7c2a-9c8f-46e0f7a1f0a1",
    "x-actor-id": "018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1a",
    "x-correlation-id": "corr-1",
    "x-permissions": "audit.read,tenant.read"
  };

  it("parses required headers into RequestSecurityContext", () => {
    const ctx = securityContextFromHeaders(valid);
    expect(ctx.tenantId).toBe(valid["x-tenant-id"]);
    expect(ctx.actorId).toBe(valid["x-actor-id"]);
    expect(ctx.correlationId).toBe("corr-1");
    expect(ctx.permissions).toEqual(["audit.read", "tenant.read"]);
  });

  it("rejects missing headers", () => {
    expect(() => securityContextFromHeaders({ ...valid, "x-tenant-id": undefined })).toThrow(
      MissingSecurityContextError
    );
  });
});
