import {
  Button,
  ContentArea,
  EmptyState,
  ErrorPanel,
  ForbiddenState,
  FormField,
  PageHeader,
  PermissionGate,
  Skeleton,
  Toast,
} from "@ai-sales/ui";
import { usePermission } from "@ai-sales/permissions";
import { useEffect, useState } from "react";
import { useAuth } from "../../../app/AuthProvider";

type PlanId = "plan_free" | "plan_pro" | "plan_business";

interface BillingResource {
  plan_id: PlanId;
  status: "active" | "past_due" | "cancelled";
  seats_used?: number | null;
  seats_limit?: number | null;
  period_start?: string | null;
  period_end?: string | null;
  usage?: {
    orders_created?: number;
    ai_suggestions?: number;
    channel_accounts?: number;
  };
}

const PLAN_OPTIONS: { id: PlanId; label: string }[] = [
  { id: "plan_free", label: "Free" },
  { id: "plan_pro", label: "Pro" },
  { id: "plan_business", label: "Business" },
];

function planLabel(id: PlanId): string {
  return PLAN_OPTIONS.find((p) => p.id === id)?.label ?? id;
}

export default function BillingRoute() {
  const canRead = usePermission("billing.read");
  const canManage = usePermission("billing.manage");
  const { authenticatedClient } = useAuth();
  const [billing, setBilling] = useState<BillingResource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("plan_free");
  const [saving, setSaving] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    const result = await authenticatedClient.request<{ data?: BillingResource }>("/billing/plan", {
      method: "GET",
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.problem?.code ?? `HTTP_${result.status}`);
      setBilling(null);
      return;
    }
    const row = result.data.data ?? null;
    setBilling(row);
    if (row) setSelectedPlan(row.plan_id);
  }

  useEffect(() => {
    if (canRead) void load();
    else setLoading(false);
  }, [canRead]);

  async function updatePlan() {
    if (!canManage || !billing) return;
    setSaving(true);
    setError(null);
    const idempotencyKey = `bil-manual-${crypto.randomUUID()}`;
    const result = await authenticatedClient.request<{ data?: BillingResource }>(
      "/billing/subscription/manual-update",
      {
        method: "POST",
        body: { plan_id: selectedPlan, reason: "web_admin_manual_update" },
        idempotencyKey,
      }
    );
    setSaving(false);
    if (!result.ok) {
      setError(result.problem?.code ?? `HTTP_${result.status}`);
      return;
    }
    const row = result.data.data ?? null;
    if (row) {
      setBilling(row);
      setSelectedPlan(row.plan_id);
    }
    setToastOpen(true);
  }

  return (
    <PermissionGate
      allowed={canRead}
      fallback={<ForbiddenState message="Bạn không có quyền xem thanh toán & usage." />}
    >
      <ContentArea>
        <PageHeader
          title="Thanh toán & usage"
          description="Gói dịch vụ và mức sử dụng — theo HO_DEFAULTS_v1."
        />
        {error ? (
          <ErrorPanel
            title={billing ? "Không thể cập nhật gói" : "Không thể tải billing"}
            code={error}
            retryable
            onRetry={() => void load()}
          />
        ) : null}
        {loading ? (
          <Skeleton height={200} aria-label="Đang tải billing" />
        ) : !billing ? (
          <EmptyState title="Chưa có dữ liệu gói dịch vụ." />
        ) : (
          <div style={{ display: "grid", gap: "var(--ai-sales-spacing-4)", maxWidth: 520 }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Gói hiện tại</div>
              <div>
                {planLabel(billing.plan_id)} · {billing.status}
              </div>
              <div style={{ color: "var(--ai-sales-color-text-muted)", marginTop: 4 }}>
                Ghế: {billing.seats_used ?? 0}
                {billing.seats_limit != null ? ` / ${billing.seats_limit}` : ""}
              </div>
              <div style={{ color: "var(--ai-sales-color-text-muted)", marginTop: 4 }}>
                Kỳ: {billing.period_start ?? "—"} → {billing.period_end ?? "—"}
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Usage kỳ này</div>
              <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                <li>Đơn tạo: {billing.usage?.orders_created ?? 0}</li>
                <li>Gợi ý AI: {billing.usage?.ai_suggestions ?? 0}</li>
                <li>Tài khoản kênh: {billing.usage?.channel_accounts ?? 0}</li>
              </ul>
            </div>
            {canManage ? (
              <FormField label="Đổi gói (manual)">
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <select
                    value={selectedPlan}
                    onChange={(e) => setSelectedPlan(e.target.value as PlanId)}
                    aria-label="Chọn gói"
                  >
                    {PLAN_OPTIONS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={saving || selectedPlan === billing.plan_id}
                    onClick={() => void updatePlan()}
                  >
                    {saving ? "Đang lưu…" : "Cập nhật gói"}
                  </Button>
                </div>
              </FormField>
            ) : (
              <p style={{ color: "var(--ai-sales-color-text-muted)", margin: 0 }}>
                Bạn chỉ có quyền xem. Cần `billing.manage` để đổi gói.
              </p>
            )}
          </div>
        )}
        <Toast open={toastOpen} onOpenChange={setToastOpen} title="Đã cập nhật gói" variant="success" />
      </ContentArea>
    </PermissionGate>
  );
}
