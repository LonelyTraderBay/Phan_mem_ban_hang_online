import { describe, expect, it } from "vitest";
import { AuthorizationError, requirePermission } from "@ai-sales/security";
import { redactValue } from "@ai-sales/observability";
import { createTestSecurityContext } from "@ai-sales/test-utils";
import { securityContextFromHeaders } from "./presentation/http/walking-skeleton-security-context.js";

describe("walking skeleton reference guards", () => {
  it("denies write path without audit.read", () => {
    const ctx = createTestSecurityContext({ permissions: ["tenant.read"] });
    expect(() => requirePermission(ctx, "audit.read")).toThrow(AuthorizationError);
  });

  it("allows write path with audit.read and redacts audit payload secrets", () => {
    const ctx = securityContextFromHeaders({
      "x-tenant-id": "018f65fd-7c6b-7c2a-9c8f-46e0f7a1f0a1",
      "x-actor-id": "018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1a",
      "x-correlation-id": "corr",
      "x-permissions": "audit.read"
    });
    expect(() => requirePermission(ctx, "audit.read")).not.toThrow();
    expect(redactValue({ message: "hello", token: "secret" })).toEqual({
      message: "hello",
      token: "[redacted]"
    });
  });
});

