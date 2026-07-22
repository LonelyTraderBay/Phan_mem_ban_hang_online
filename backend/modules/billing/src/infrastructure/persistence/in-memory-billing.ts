import type { MeterKey } from "../../domain/entitlements.js";
import type {
  BillingRepository,
  SubscriptionRecord,
  UsageMeterRecord
} from "../../application/billing.js";

export class InMemoryBillingRepository implements BillingRepository {
  readonly subscriptions = new Map<string, SubscriptionRecord>();
  readonly meters = new Map<string, UsageMeterRecord>();
  readonly idempotency = new Map<string, UsageMeterRecord>();

  private meterKey(tenantId: string, meterKey: MeterKey) {
    return `${tenantId}:${meterKey}`;
  }

  async getSubscription(tenantId: string): Promise<SubscriptionRecord | null> {
    return this.subscriptions.get(tenantId) ?? null;
  }

  async saveSubscription(subscription: SubscriptionRecord): Promise<void> {
    this.subscriptions.set(subscription.tenantId, subscription);
  }

  async getMeter(tenantId: string, meterKey: MeterKey): Promise<UsageMeterRecord | null> {
    return this.meters.get(this.meterKey(tenantId, meterKey)) ?? null;
  }

  async saveMeter(meter: UsageMeterRecord): Promise<UsageMeterRecord> {
    if (meter.idempotencyKey) {
      const existing = this.idempotency.get(`${meter.tenantId}:${meter.idempotencyKey}`);
      if (existing) return existing;
      this.idempotency.set(`${meter.tenantId}:${meter.idempotencyKey}`, meter);
    }
    this.meters.set(this.meterKey(meter.tenantId, meter.meterKey), meter);
    return meter;
  }

  async findMeterByIdempotency(tenantId: string, key: string): Promise<UsageMeterRecord | null> {
    return this.idempotency.get(`${tenantId}:${key}`) ?? null;
  }
}
