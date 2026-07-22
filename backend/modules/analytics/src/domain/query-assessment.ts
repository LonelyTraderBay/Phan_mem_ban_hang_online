/**
 * BE-DAT-010 — Query/load/index assessment stub (read-replica readiness).
 */

export interface QueryAssessment {
  readonly reportType: string;
  readonly recommendedIndexes: readonly string[];
  readonly readReplicaCandidate: boolean;
  readonly notes: string;
}

const ASSESSMENTS: Record<string, QueryAssessment> = {
  revenue: {
    reportType: "revenue",
    recommendedIndexes: ["idx_daily_tenant_metrics_tenant_date", "idx_order_profit_facts_tenant_date"],
    readReplicaCandidate: true,
    notes: "Aggregate reads; safe for read replica with watermark lag <= 5m."
  },
  gross_profit: {
    reportType: "gross_profit",
    recommendedIndexes: ["idx_order_profit_facts_tenant_date", "idx_daily_product_metrics_key"],
    readReplicaCandidate: true,
    notes: "Cost fields require catalog.read_cost permission at API layer."
  },
  sla: {
    reportType: "sla",
    recommendedIndexes: ["uq_conversation_conversion_facts_key"],
    readReplicaCandidate: true,
    notes: "SLA breach counts derived from conversation_conversion_facts."
  },
  ai_quality: {
    reportType: "ai_quality",
    recommendedIndexes: ["uq_ai_quality_facts_tenant_date"],
    readReplicaCandidate: true,
    notes: "Shares ai_quality_facts table from migration 000021."
  },
  dashboard_today: {
    reportType: "dashboard_today",
    recommendedIndexes: ["idx_daily_tenant_metrics_tenant_date"],
    readReplicaCandidate: false,
    notes: "Low-latency dashboard; prefer primary with short TTL cache."
  }
};

export function assessQueryLoad(reportType: string): QueryAssessment {
  return (
    ASSESSMENTS[reportType] ?? {
      reportType,
      recommendedIndexes: [],
      readReplicaCandidate: false,
      notes: "No assessment catalog entry; default to primary."
    }
  );
}
