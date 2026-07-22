import { describe, expect, it } from "vitest";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import {
  createReprocessRequest,
  disableTenantAI,
  getTenantHealth,
  listTenantsForOperations,
  OperationsError,
  setTenantFeatureFlag
} from "./operations.js";
import {
  buildPackingSlipPayload,
  evaluateClientVersion,
  ingestCrashTelemetry,
  revalidateOfflineDraft,
  WINDOWS_NOTIFICATION_CONTRACT
} from "./desktop.js";
import { InMemoryOperationsRepository } from "../infrastructure/persistence/in-memory-operations.js";

const tenantA = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d1b");
const targetId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7f1b");
const opsPerms = [
  "ops.tenant.read",
  "ops.tenant_health",
  "ops.feature_flag",
  "ops.ai.disable",
  "ops.alert.read",
  "ops.reprocess",
  "ops.ai_health.read"
];

describe("desktop stubs", () => {
  it("enforces minimum client version", () => {
    expect(evaluateClientVersion("0.9.0").allowed).toBe(false);
    expect(evaluateClientVersion("1.0.0").allowed).toBe(true);
  });

  it("exposes Windows SSE notification contract", () => {
    expect(WINDOWS_NOTIFICATION_CONTRACT.channel).toBe("sse");
    expect(WINDOWS_NOTIFICATION_CONTRACT.eventTypes).toContain("billing.usage_recorded");
  });

  it("builds signed packing slip payload", () => {
    const payload = buildPackingSlipPayload(targetId);
    expect(payload.signedAssetUrl).toContain("sig=stub");
  });

  it("revalidates offline drafts", () => {
    const result = revalidateOfflineDraft({
      clientVersion: 1,
      serverVersion: 2,
      payloadHash: "a",
      serverPayloadHash: "b"
    });
    expect(result.accepted).toBe(false);
    expect(result.conflicts).toContain("server_ahead");
  });

  it("ingests crash telemetry without PII", () => {
    const event = ingestCrashTelemetry({
      tenantId: tenantA,
      deviceId: targetId,
      clientVersion: "1.0.0",
      crashSignature: "access-violation"
    });
    expect(event.crashSignature).toBe("access-violation");
  });
});

describe("operations application", () => {
  it("lists tenants for ops", async () => {
    const repo = new InMemoryOperationsRepository();
    repo.seedTenant(tenantA, "Tenant A");
    const result = await listTenantsForOperations({ repo, actorPermissions: opsPerms });
    expect(result.data).toHaveLength(1);
  });

  it("returns tenant health", async () => {
    const repo = new InMemoryOperationsRepository();
    repo.seedTenant(tenantA, "Tenant A");
    const health = await getTenantHealth({
      repo,
      tenantId: tenantA,
      actorPermissions: opsPerms
    });
    expect(health.data.status).toBe("healthy");
  });

  it("sets feature flag with idempotency key", async () => {
    const repo = new InMemoryOperationsRepository();
    const result = await setTenantFeatureFlag({
      repo,
      tenantId: tenantA,
      flagKey: "ai.autopilot",
      enabled: true,
      actorPermissions: opsPerms,
      idempotencyKey: "flag-1"
    });
    expect(result.data.status).toBe("enabled");
  });

  it("disables tenant AI", async () => {
    const repo = new InMemoryOperationsRepository();
    repo.seedTenant(tenantA, "Tenant A");
    const result = await disableTenantAI({
      repo,
      tenantId: tenantA,
      actorPermissions: opsPerms,
      idempotencyKey: "disable-1"
    });
    expect(result.data.detail?.ai_enabled).toBe(false);
  });

  it("queues reprocess request", async () => {
    const repo = new InMemoryOperationsRepository();
    const result = await createReprocessRequest({
      repo,
      actorPermissions: opsPerms,
      idempotencyKey: "reprocess-1",
      targetType: "webhook",
      targetId
    });
    expect(result.data.status).toBe("queued");
  });

  it("denies ops without permission", async () => {
    const repo = new InMemoryOperationsRepository();
    await expect(
      listTenantsForOperations({ repo, actorPermissions: [] })
    ).rejects.toBeInstanceOf(OperationsError);
  });
});
