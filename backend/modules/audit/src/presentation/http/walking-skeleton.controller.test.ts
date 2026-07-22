/**
 * BE-FND-017 reference suite (HTTP half) — permission negative and endpoint
 * contract against the real walking-skeleton controller.
 */
import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { BadRequestException, ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import { AuthorizationError } from "@ai-sales/security";
import type { WalkingSkeletonTracer } from "../../application/ports/audit-writer.port.js";
import { createWalkingSkeletonController } from "./walking-skeleton.controller.js";

const stubTracer: WalkingSkeletonTracer = {
  async trace(ctx, _message, ids) {
    return {
      auditId: ids.auditId,
      outboxEventId: ids.outboxId,
      correlationId: ctx.correlationId,
      action: "walking_skeleton.trace"
    };
  }
};

function controller(enabled = true) {
  const ControllerClass = createWalkingSkeletonController({ enabled, tracer: stubTracer });
  return new ControllerClass();
}

const validHeaders = {
  "x-tenant-id": "018f65fd-7c6b-7c2a-9c8f-46e0f7a1f0a1",
  "x-actor-id": "018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1a",
  "x-correlation-id": "corr-1",
  "x-permissions": "audit.read"
};

describe("BE-FND-017 · permission negative (HTTP)", () => {
  it("rejects a caller without audit.read", async () => {
    await expect(
      controller().trace({ message: "hello" }, { ...validHeaders, "x-permissions": "tenant.read" })
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("rejects a caller with no security context headers as 403", async () => {
    await expect(controller().trace({ message: "hello" }, {})).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("BE-FND-017 · endpoint contract", () => {
  it("returns the documented { data: { auditId, outboxEventId, correlationId, action } } shape", async () => {
    const response = await controller().trace({ message: "hello" }, validHeaders);
    expect(Object.keys(response)).toEqual(["data"]);
    expect(Object.keys(response.data).sort()).toEqual(["action", "auditId", "correlationId", "outboxEventId"]);
    expect(response.data.action).toBe("walking_skeleton.trace");
    expect(response.data.correlationId).toBe("corr-1");
  });

  it("is 503 when the walking skeleton is disabled", async () => {
    await expect(controller(false).trace({ message: "hello" }, validHeaders)).rejects.toBeInstanceOf(
      ServiceUnavailableException
    );
  });

  it("is 400 when message is missing", async () => {
    await expect(controller().trace({ message: "" }, validHeaders)).rejects.toBeInstanceOf(BadRequestException);
  });
});
