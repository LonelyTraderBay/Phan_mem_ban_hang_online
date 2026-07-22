import { generateUuidV7 } from "@ai-sales/domain-kernel";

/**
 * BE-OPS-001…005 + BE-DSK-001…005 — Operations/desktop application layer.
 */

export type OpsPermission =
  | "ops.tenant.read"
  | "ops.tenant_health"
  | "support.access"
  | "ops.feature_flag"
  | "ops.ai.disable"
  | "ops.alert.read"
  | "ops.reprocess"
  | "ops.ai_health.read";

export type OpsErrorCode =
  | "VALIDATION_FAILED"
  | "INSUFFICIENT_PERMISSION"
  | "RESOURCE_NOT_FOUND"
  | "IDEMPOTENCY_KEY_REQUIRED";

export class OperationsError extends Error {
  constructor(
    message: string,
    readonly code: OpsErrorCode
  ) {
    super(message);
    this.name = "OperationsError";
  }
}

export interface TenantHealthRecord {
  readonly tenantId: string;
  readonly status: "healthy" | "degraded" | "unhealthy";
  readonly detail: Record<string, unknown>;
}

export interface FeatureFlagOverride {
  readonly tenantId: string;
  readonly flagKey: string;
  readonly enabled: boolean;
  readonly expiresAt: string | null;
  readonly reason: string | null;
}

export interface SystemAlertRecord {
  readonly id: string;
  readonly severity: "info" | "warning" | "critical";
  readonly status: "open" | "acknowledged" | "resolved";
  readonly title: string;
  readonly detail: Record<string, unknown>;
  readonly targetTenantId: string | null;
  readonly createdAt: string;
}

export interface ReprocessRequestRecord {
  readonly id: string;
  readonly targetType: "webhook" | "outbound" | "import" | "ai_eval";
  readonly targetId: string;
  readonly targetTenantId: string | null;
  readonly reason: string | null;
  readonly status: "queued" | "running" | "completed" | "failed" | "cancelled";
  readonly createdAt: string;
  /** Set on insert so unique index applies atomically (avoids null-key race). */
  readonly idempotencyKey?: string | null;
}

export interface OperationsRepository {
  listTenants(): Promise<readonly { readonly id: string; readonly name: string; readonly status: string }[]>;
  getTenantHealth(tenantId: string): Promise<TenantHealthRecord | null>;
  setFeatureFlag(override: FeatureFlagOverride): Promise<FeatureFlagOverride>;
  getFeatureFlag(tenantId: string, flagKey: string): Promise<FeatureFlagOverride | null>;
  disableAi(tenantId: string): Promise<{ readonly tenantId: string; readonly aiEnabled: boolean }>;
  listAlerts(): Promise<readonly SystemAlertRecord[]>;
  createAlert(alert: SystemAlertRecord): Promise<SystemAlertRecord>;
  createReprocess(request: ReprocessRequestRecord): Promise<ReprocessRequestRecord>;
  findReprocessByIdempotency(key: string): Promise<ReprocessRequestRecord | null>;
  getAiHealth(): Promise<Record<string, unknown>>;
}

function emptyPage() {
  return { next_cursor: null as null, has_more: false as const };
}

function toOpsResource(record: {
  readonly id: string;
  readonly status: string;
  readonly tenantId?: string | null;
  readonly createdAt: string;
  readonly detail?: Record<string, unknown> | null;
}) {
  return {
    id: record.id,
    status: record.status,
    tenant_id: record.tenantId ?? null,
    created_at: record.createdAt,
    detail: record.detail ?? null
  };
}

export function requireOpsPermission(
  actorPermissions: readonly string[],
  permission: OpsPermission
): void {
  if (!actorPermissions.includes(permission)) {
    throw new OperationsError("Permission denied.", "INSUFFICIENT_PERMISSION");
  }
}

export async function listTenantsForOperations(options: {
  readonly repo: OperationsRepository;
  readonly actorPermissions: readonly string[];
}) {
  requireOpsPermission(options.actorPermissions, "ops.tenant.read");
  const tenants = await options.repo.listTenants();
  return {
    data: tenants.map((t) =>
      toOpsResource({
        id: t.id,
        status: t.status,
        tenantId: t.id,
        createdAt: new Date().toISOString(),
        detail: { name: t.name }
      })
    ),
    page_info: emptyPage(),
    meta: {}
  };
}

export async function getTenantHealth(options: {
  readonly repo: OperationsRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
}) {
  requireOpsPermission(options.actorPermissions, "ops.tenant_health");
  const health = await options.repo.getTenantHealth(options.tenantId);
  if (!health) {
    throw new OperationsError("Tenant not found.", "RESOURCE_NOT_FOUND");
  }
  return {
    data: toOpsResource({
      id: generateUuidV7(),
      status: health.status,
      tenantId: health.tenantId,
      createdAt: new Date().toISOString(),
      detail: health.detail
    }),
    meta: {}
  };
}

export async function setTenantFeatureFlag(options: {
  readonly repo: OperationsRepository;
  readonly tenantId: string;
  readonly flagKey: string;
  readonly enabled: boolean;
  readonly expiresAt?: string | null;
  readonly reason?: string | null;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
}) {
  requireOpsPermission(options.actorPermissions, "ops.feature_flag");
  if (!options.idempotencyKey?.trim()) {
    throw new OperationsError("Idempotency-Key header required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const saved = await options.repo.setFeatureFlag({
    tenantId: options.tenantId,
    flagKey: options.flagKey,
    enabled: options.enabled,
    expiresAt: options.expiresAt ?? null,
    reason: options.reason ?? null
  });
  return {
    data: toOpsResource({
      id: generateUuidV7(),
      status: saved.enabled ? "enabled" : "disabled",
      tenantId: saved.tenantId,
      createdAt: new Date().toISOString(),
      detail: { flag_key: saved.flagKey, expires_at: saved.expiresAt, reason: saved.reason }
    }),
    meta: {}
  };
}

export async function disableTenantAI(options: {
  readonly repo: OperationsRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
}) {
  requireOpsPermission(options.actorPermissions, "ops.ai.disable");
  if (!options.idempotencyKey?.trim()) {
    throw new OperationsError("Idempotency-Key header required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const result = await options.repo.disableAi(options.tenantId);
  return {
    data: toOpsResource({
      id: generateUuidV7(),
      status: "disabled",
      tenantId: result.tenantId,
      createdAt: new Date().toISOString(),
      detail: { ai_enabled: result.aiEnabled }
    }),
    meta: {}
  };
}

export async function listSystemAlerts(options: {
  readonly repo: OperationsRepository;
  readonly actorPermissions: readonly string[];
}) {
  requireOpsPermission(options.actorPermissions, "ops.alert.read");
  const alerts = await options.repo.listAlerts();
  return {
    data: alerts.map((a) =>
      toOpsResource({
        id: a.id,
        status: a.status,
        tenantId: a.targetTenantId,
        createdAt: a.createdAt,
        detail: { severity: a.severity, title: a.title, ...a.detail }
      })
    ),
    page_info: emptyPage(),
    meta: {}
  };
}

export async function createReprocessRequest(options: {
  readonly repo: OperationsRepository;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly targetType: "webhook" | "outbound" | "import" | "ai_eval";
  readonly targetId: string;
  readonly reason?: string | null;
  readonly targetTenantId?: string | null;
}) {
  requireOpsPermission(options.actorPermissions, "ops.reprocess");
  if (!options.idempotencyKey?.trim()) {
    throw new OperationsError("Idempotency-Key header required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const cached = await options.repo.findReprocessByIdempotency(options.idempotencyKey);
  if (cached) {
    return { data: { job_id: cached.id, status: cached.status, status_url: null }, meta: {} };
  }
  const id = generateUuidV7();
  const created = await options.repo.createReprocess({
    id,
    targetType: options.targetType,
    targetId: options.targetId,
    targetTenantId: options.targetTenantId ?? null,
    reason: options.reason ?? null,
    status: "queued",
    createdAt: new Date().toISOString(),
    idempotencyKey: options.idempotencyKey
  });
  if ("trackReprocessIdempotency" in options.repo) {
    await Promise.resolve(
      (
        options.repo as {
          trackReprocessIdempotency: (k: string, id: string) => void | Promise<void>;
        }
      ).trackReprocessIdempotency(options.idempotencyKey, created.id)
    );
  }
  return { data: { job_id: created.id, status: created.status, status_url: null }, meta: {} };
}

export async function getAiHealth(options: {
  readonly repo: OperationsRepository;
  readonly actorPermissions: readonly string[];
}) {
  requireOpsPermission(options.actorPermissions, "ops.ai_health.read");
  const health = await options.repo.getAiHealth();
  return {
    data: toOpsResource({
      id: generateUuidV7(),
      status: String(health.status ?? "healthy"),
      tenantId: null,
      createdAt: new Date().toISOString(),
      detail: health
    }),
    meta: {}
  };
}

export async function createSupportAccessForOps(options: {
  readonly tenantId: string;
  readonly expiresAt: string;
  readonly reason?: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly createGrant: (args: {
    readonly tenantId: string;
    readonly expiresAt: string;
    readonly reason: string;
  }) => Promise<{ readonly id: string; readonly status: string }>;
}) {
  requireOpsPermission(options.actorPermissions, "support.access");
  if (!options.idempotencyKey?.trim()) {
    throw new OperationsError("Idempotency-Key header required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const grant = await options.createGrant({
    tenantId: options.tenantId,
    expiresAt: options.expiresAt,
    reason: options.reason ?? "ops support access"
  });
  return {
    data: toOpsResource({
      id: grant.id,
      status: grant.status,
      tenantId: options.tenantId,
      createdAt: new Date().toISOString(),
      detail: { expires_at: options.expiresAt, reason: options.reason ?? null }
    }),
    meta: {}
  };
}
