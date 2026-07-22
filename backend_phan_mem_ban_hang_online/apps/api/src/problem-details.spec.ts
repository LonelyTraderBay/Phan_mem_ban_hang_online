import { describe, expect, it } from "vitest";
import { AuthorizationError, MissingSecurityContextError } from "@ai-sales/security";
import { IdempotencyKeyReusedError } from "@ai-sales/idempotency";
import { ForbiddenException } from "@nestjs/common";
import { toProblemDetails } from "./problem-details";

describe("toProblemDetails", () => {
  it("maps authorization and security context errors", () => {
    expect(toProblemDetails(new AuthorizationError("audit.read")).code).toBe("PERMISSION_DENIED");
    expect(toProblemDetails(new MissingSecurityContextError("x-tenant-id")).status).toBe(403);
  });

  it("maps idempotency conflicts and HttpException", () => {
    expect(toProblemDetails(new IdempotencyKeyReusedError()).code).toBe("IDEMPOTENCY_KEY_REUSED");
    const problem = toProblemDetails(new ForbiddenException("nope"), {
      instance: "/x",
      correlationId: "c1"
    });
    expect(problem.status).toBe(403);
    expect(problem.instance).toBe("/x");
    expect(problem.correlationId).toBe("c1");
    expect(problem.type).toContain("problems/");
  });

  it("hides unexpected error details", () => {
    const problem = toProblemDetails(new Error("secret stack"));
    expect(problem.status).toBe(500);
    expect(problem.detail).not.toContain("secret");
  });
});
