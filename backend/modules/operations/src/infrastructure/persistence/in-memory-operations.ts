import type {
  FeatureFlagOverride,
  OperationsRepository,
  ReprocessRequestRecord,
  SystemAlertRecord,
  TenantHealthRecord
} from "../../application/operations.js";

export class InMemoryOperationsRepository implements OperationsRepository {
  readonly tenants = new Map<string, { readonly id: string; readonly name: string; readonly status: string }>();
  readonly health = new Map<string, TenantHealthRecord>();
  readonly flags = new Map<string, FeatureFlagOverride>();
  readonly aiDisabled = new Set<string>();
  readonly alerts: SystemAlertRecord[] = [];
  readonly reprocess = new Map<string, ReprocessRequestRecord>();
  readonly idempotency = new Map<string, string>();

  seedTenant(id: string, name: string, status = "active") {
    this.tenants.set(id, { id, name, status });
    this.health.set(id, {
      tenantId: id,
      status: "healthy",
      detail: { queue_depth: 0, webhook_backlog: 0 }
    });
  }

  async listTenants() {
    return [...this.tenants.values()];
  }

  async getTenantHealth(tenantId: string) {
    return this.health.get(tenantId) ?? null;
  }

  async setFeatureFlag(override: FeatureFlagOverride) {
    this.flags.set(`${override.tenantId}:${override.flagKey}`, override);
    return override;
  }

  async getFeatureFlag(tenantId: string, flagKey: string) {
    return this.flags.get(`${tenantId}:${flagKey}`) ?? null;
  }

  async disableAi(tenantId: string) {
    this.aiDisabled.add(tenantId);
    return { tenantId, aiEnabled: false };
  }

  async listAlerts() {
    return this.alerts;
  }

  async createAlert(alert: SystemAlertRecord) {
    this.alerts.push(alert);
    return alert;
  }

  async createReprocess(request: ReprocessRequestRecord) {
    this.reprocess.set(request.id, request);
    return request;
  }

  async findReprocessByIdempotency(key: string) {
    const id = this.idempotency.get(key);
    return id ? (this.reprocess.get(id) ?? null) : null;
  }

  trackReprocessIdempotency(key: string, id: string) {
    this.idempotency.set(key, id);
  }

  async getAiHealth() {
    return {
      status: "healthy",
      provider_latency_p95_ms: 1200,
      blocked_output_rate: 0.02,
      budget_exceeded_tenants: 0
    };
  }
}
