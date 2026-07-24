import { ContentArea, PageHeader, Card, EmptyState, StatusBadge } from "@ai-sales/ui";

export default function AiHealthRoute() {
  return (
    <ContentArea>
      <PageHeader title="Sức khỏe AI" description="Blocked outputs, latency, kill-switch ops." />
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <StatusBadge label="Fail-closed khi flag tắt" tone="success" />
          <EmptyState title="Chưa có tín hiệu live" description="Nối ops AI health khi API sẵn sàng." />
        </div>
      </Card>
    </ContentArea>
  );
}
