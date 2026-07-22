import { describe, expect, it } from "vitest";
import { createTestSecurityContext } from "@ai-sales/test-utils";
import { assertTenantSecurityContext, TenantContextError } from "./index.js";

describe("assertTenantSecurityContext", () => {
  it("accepts a valid context", () => {
    expect(() => assertTenantSecurityContext(createTestSecurityContext())).not.toThrow();
  });

  it("rejects empty tenantId/actorId/correlationId", () => {
    expect(() =>
      assertTenantSecurityContext(createTestSecurityContext({ tenantId: "   " as never }))
    ).toThrow(TenantContextError);
    expect(() =>
      assertTenantSecurityContext(createTestSecurityContext({ actorId: "" as never }))
    ).toThrow(TenantContextError);
    expect(() =>
      assertTenantSecurityContext(createTestSecurityContext({ correlationId: "" }))
    ).toThrow(TenantContextError);
  });
});
