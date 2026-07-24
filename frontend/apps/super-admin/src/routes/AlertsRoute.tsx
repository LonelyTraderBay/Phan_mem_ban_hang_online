import { ContentArea, PageHeader, Card, DataList, DataListItem, StatusBadge, EmptyState } from "@ai-sales/ui";

const MOCK_ALERTS = [
  { id: "alt_1", title: "Channel webhook latency cao", severity: "warning" },
  { id: "alt_2", title: "AI blocked-output spike", severity: "critical" },
];

export default function AlertsRoute() {
  return (
    <ContentArea>
      <PageHeader title="Cảnh báo" description="Cảnh báo hệ thống và ưu tiên xử lý." />
      <Card>
        {MOCK_ALERTS.length === 0 ? (
          <EmptyState title="Không có cảnh báo" />
        ) : (
          <DataList>
            {MOCK_ALERTS.map((a) => (
              <DataListItem
                key={a.id}
                primary={a.title}
                secondary={a.id}
                meta={
                  <StatusBadge
                    label={a.severity}
                    tone={a.severity === "critical" ? "danger" : "warning"}
                  />
                }
              />
            ))}
          </DataList>
        )}
      </Card>
    </ContentArea>
  );
}
