/**
 * BE-HRD-007 — Data retention / privacy export rehearsal stub.
 */
export const RETENTION_POLICIES = [
  { table: "event_logs", retainDays: 365, anonymize: false },
  { table: "ai_logs", retainDays: 90, anonymize: true },
  { table: "audit_events", retainDays: 2555, anonymize: false }
];

export function exportTenantDataStub(tenantId) {
  return {
    tenant_id: tenantId,
    exported_at: new Date().toISOString(),
    sections: ["customers", "orders", "conversations"],
    pii_redacted: true
  };
}
