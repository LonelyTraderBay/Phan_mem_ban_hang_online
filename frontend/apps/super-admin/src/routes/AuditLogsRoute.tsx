import { ContentArea, PageHeader, Card, DataList, DataListItem, EmptyState } from "@ai-sales/ui";

const MOCK_AUDIT = [
  { id: "aud_1", action: "ops.support.elevate", actor: "ops@example.com" },
  { id: "aud_2", action: "ops.ai.disable", actor: "ops@example.com" },
];

export default function AuditLogsRoute() {
  return (
    <ContentArea>
      <PageHeader title="Audit logs" description="Nhật ký thao tác Super Admin / support." />
      <Card>
        {MOCK_AUDIT.length === 0 ? (
          <EmptyState title="Chưa có log" />
        ) : (
          <DataList>
            {MOCK_AUDIT.map((row) => (
              <DataListItem key={row.id} primary={row.action} secondary={row.actor} />
            ))}
          </DataList>
        )}
      </Card>
    </ContentArea>
  );
}
