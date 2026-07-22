import { sql } from "kysely";
import type { AppDatabase } from "@ai-sales/database";
import { adapterSecurityContext, withTenantTransaction } from "@ai-sales/database";
import { generateUuidV7 } from "@ai-sales/domain-kernel";
import {
  OperationsError,
  type FeatureFlagOverride,
  type OperationsRepository,
  type ReprocessRequestRecord,
  type SystemAlertRecord,
  type TenantHealthRecord
} from "../../application/operations.js";

/**
 * Placeholder tenant GUC for platform-scoped ops writes (system_alerts /
 * reprocess_requests WITH CHECK true). Not a real tenant row — only used so
 * withTenantTransaction can set app.tenant_id for RLS session context.
 */
export const PLATFORM_OPS_TENANT = "018f0000-0000-7000-8000-000000000099";

type FlagRow = {
  tenant_id: string;
  flag_key: string;
  enabled: boolean;
  expires_at: Date | null;
  reason: string | null;
};

type AlertRow = {
  id: string;
  severity: SystemAlertRecord["severity"];
  status: SystemAlertRecord["status"];
  title: string;
  detail: unknown;
  target_tenant_id: string | null;
  created_at: Date;
};

type ReprocessRow = {
  id: string;
  target_type: ReprocessRequestRecord["targetType"];
  target_id: string;
  target_tenant_id: string | null;
  reason: string | null;
  status: ReprocessRequestRecord["status"];
  created_at: Date;
};

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code: unknown }).code) === "23505"
  );
}

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code: unknown }).code) === "23503"
  );
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function toFlag(row: FlagRow): FeatureFlagOverride {
  return {
    tenantId: row.tenant_id,
    flagKey: row.flag_key,
    enabled: row.enabled,
    expiresAt: toIso(row.expires_at),
    reason: row.reason
  };
}

function toAlert(row: AlertRow): SystemAlertRecord {
  return {
    id: row.id,
    severity: row.severity,
    status: row.status,
    title: row.title,
    detail: parseObject(row.detail),
    targetTenantId: row.target_tenant_id,
    createdAt: toIso(row.created_at)!
  };
}

function toReprocess(row: ReprocessRow): ReprocessRequestRecord {
  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    targetTenantId: row.target_tenant_id,
    reason: row.reason,
    status: row.status,
    createdAt: toIso(row.created_at)!
  };
}

/**
 * HYBRID Postgres operations adapter.
 * Persisted: feature_flag_overrides, system_alerts, reprocess_requests, tenant_ai_controls.
 * Stubbed: listTenants (TENANT_ROOT RLS blocks platform list), getAiHealth (synthetic),
 * getTenantHealth (healthy stub if tenant row visible under tenant context).
 */
export class PostgresOperationsRepository implements OperationsRepository {
  /** Process-local idempotency map — also mirrored to DB idempotency_key via track. */
  private readonly idempotency = new Map<string, string>();

  constructor(private readonly db: AppDatabase) {}

  /**
   * Platform list blocked by TENANT_ROOT RLS on app.tenants —
   * cannot enumerate all tenants from app_runtime without a platform policy.
   */
  async listTenants(): Promise<
    readonly { readonly id: string; readonly name: string; readonly status: string }[]
  > {
    return [];
  }

  async getTenantHealth(tenantId: string): Promise<TenantHealthRecord | null> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<{ id: string }>`
        select id from app.tenants where id = ${tenantId}::uuid limit 1
      `.execute(trx);
      if (!result.rows[0]) return null;
      // Synthetic healthy stub — no real probe metrics table yet.
      return {
        tenantId,
        status: "healthy",
        detail: { queue_depth: 0, webhook_backlog: 0, source: "stub" }
      };
    });
  }

  async setFeatureFlag(override: FeatureFlagOverride): Promise<FeatureFlagOverride> {
    // Parent rows must be seeded in migration 000025 — runtime cannot INSERT feature_flags.
    const ctx = adapterSecurityContext(override.tenantId);
    try {
      return await withTenantTransaction(this.db, ctx, async (trx) => {
        const id = generateUuidV7();
        const result = await sql<FlagRow>`
          insert into app.feature_flag_overrides (
            id, tenant_id, flag_key, enabled, expires_at, reason
          ) values (
            ${id}::uuid,
            ${override.tenantId}::uuid,
            ${override.flagKey},
            ${override.enabled},
            ${override.expiresAt}::timestamptz,
            ${override.reason}
          )
          on conflict (tenant_id, flag_key) do update set
            enabled = excluded.enabled,
            expires_at = excluded.expires_at,
            reason = excluded.reason
          returning tenant_id, flag_key, enabled, expires_at, reason
        `.execute(trx);
        return toFlag(result.rows[0]!);
      });
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new OperationsError(
          `Unknown feature flag key: ${override.flagKey}`,
          "VALIDATION_FAILED"
        );
      }
      throw error;
    }
  }

  async getFeatureFlag(
    tenantId: string,
    flagKey: string
  ): Promise<FeatureFlagOverride | null> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<FlagRow>`
        select tenant_id, flag_key, enabled, expires_at, reason
        from app.feature_flag_overrides
        where tenant_id = ${tenantId}::uuid
          and flag_key = ${flagKey}
        limit 1
      `.execute(trx);
      const row = result.rows[0];
      return row ? toFlag(row) : null;
    });
  }

  async disableAi(
    tenantId: string
  ): Promise<{ readonly tenantId: string; readonly aiEnabled: boolean }> {
    const ctx = adapterSecurityContext(tenantId);
    const disabledAt = new Date().toISOString();
    // AI getTenantSwitch prefers metadata.switch over switch_enabled columns.
    const switchState = {
      disabled: true,
      disabledAt,
      disabledBy: "ops.disable_ai",
      fallbackMode: "deterministic"
    };
    await withTenantTransaction(this.db, ctx, async (trx) => {
      await sql`
        insert into app.tenant_ai_controls (
          tenant_id, switch_enabled, switch_reason, budget_tokens_remaining,
          budget_period, updated_at, metadata
        ) values (
          ${tenantId}::uuid,
          false,
          'ops.disable_ai',
          1000000,
          'daily',
          now(),
          ${JSON.stringify({ switch: switchState })}::jsonb
        )
        on conflict (tenant_id) do update set
          switch_enabled = false,
          switch_reason = 'ops.disable_ai',
          updated_at = now(),
          metadata = jsonb_set(
            coalesce(app.tenant_ai_controls.metadata, '{}'::jsonb),
            '{switch}',
            ${JSON.stringify(switchState)}::jsonb
          )
      `.execute(trx);
    });
    return { tenantId, aiEnabled: false };
  }

  async listAlerts(): Promise<readonly SystemAlertRecord[]> {
    const ctx = adapterSecurityContext(PLATFORM_OPS_TENANT);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<AlertRow>`
        select id, severity, status, title, detail, target_tenant_id, created_at
        from app.system_alerts
        order by created_at desc
        limit 200
      `.execute(trx);
      return result.rows.map(toAlert);
    });
  }

  async createAlert(alert: SystemAlertRecord): Promise<SystemAlertRecord> {
    const tenantCtx = alert.targetTenantId ?? PLATFORM_OPS_TENANT;
    const ctx = adapterSecurityContext(tenantCtx);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<AlertRow>`
        insert into app.system_alerts (
          id, severity, status, title, detail, target_tenant_id, created_at
        ) values (
          ${alert.id}::uuid,
          ${alert.severity},
          ${alert.status},
          ${alert.title},
          ${JSON.stringify(alert.detail)}::jsonb,
          ${alert.targetTenantId}::uuid,
          ${alert.createdAt}::timestamptz
        )
        returning id, severity, status, title, detail, target_tenant_id, created_at
      `.execute(trx);
      return toAlert(result.rows[0]!);
    });
  }

  async createReprocess(request: ReprocessRequestRecord): Promise<ReprocessRequestRecord> {
    const tenantCtx = request.targetTenantId ?? PLATFORM_OPS_TENANT;
    const ctx = adapterSecurityContext(tenantCtx);
    const idempotencyKey = request.idempotencyKey?.trim() || null;
    if (idempotencyKey) {
      this.idempotency.set(idempotencyKey, request.id);
    }
    try {
      return await withTenantTransaction(this.db, ctx, async (trx) => {
        const result = await sql<ReprocessRow>`
          insert into app.reprocess_requests (
            id, target_type, target_id, target_tenant_id, reason, status,
            created_at, idempotency_key
          ) values (
            ${request.id}::uuid,
            ${request.targetType},
            ${request.targetId}::uuid,
            ${request.targetTenantId}::uuid,
            ${request.reason},
            ${request.status},
            ${request.createdAt}::timestamptz,
            ${idempotencyKey}
          )
          returning id, target_type, target_id, target_tenant_id, reason, status, created_at
        `.execute(trx);
        return toReprocess(result.rows[0]!);
      });
    } catch (error) {
      if (!isUniqueViolation(error) || !idempotencyKey) throw error;
      const existing = await this.findReprocessByIdempotency(idempotencyKey);
      if (!existing) throw error;
      this.idempotency.set(idempotencyKey, existing.id);
      return existing;
    }
  }

  async findReprocessByIdempotency(key: string): Promise<ReprocessRequestRecord | null> {
    const mappedId = this.idempotency.get(key);
    const ctx = adapterSecurityContext(PLATFORM_OPS_TENANT);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      if (mappedId) {
        const byId = await sql<ReprocessRow>`
          select id, target_type, target_id, target_tenant_id, reason, status, created_at
          from app.reprocess_requests
          where id = ${mappedId}::uuid
          limit 1
        `.execute(trx);
        if (byId.rows[0]) return toReprocess(byId.rows[0]);
      }
      const result = await sql<ReprocessRow>`
        select id, target_type, target_id, target_tenant_id, reason, status, created_at
        from app.reprocess_requests
        where idempotency_key = ${key}
        limit 1
      `.execute(trx);
      const row = result.rows[0];
      return row ? toReprocess(row) : null;
    });
  }

  /**
   * Duck-typed hook used by createReprocessRequest: sync Map + persist DB key.
   * Returns a Promise so callers can await; InMemory stays sync.
   */
  trackReprocessIdempotency(key: string, id: string): Promise<void> {
    this.idempotency.set(key, id);
    const ctx = adapterSecurityContext(PLATFORM_OPS_TENANT);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      try {
        await sql`
          update app.reprocess_requests
          set idempotency_key = ${key}
          where id = ${id}::uuid
            and idempotency_key is null
        `.execute(trx);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const existing = await sql<{ id: string }>`
          select id from app.reprocess_requests
          where idempotency_key = ${key}
          limit 1
        `.execute(trx);
        if (existing.rows[0]) {
          this.idempotency.set(key, existing.rows[0].id);
        }
      }
    });
  }

  /** Hardcoded stub — mirrors InMemory; no live provider probe yet. */
  async getAiHealth(): Promise<Record<string, unknown>> {
    return {
      status: "healthy",
      provider_latency_p95_ms: 1200,
      blocked_output_rate: 0.02,
      budget_exceeded_tenants: 0,
      source: "stub"
    };
  }
}
