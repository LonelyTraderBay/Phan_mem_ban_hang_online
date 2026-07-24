import { ContentArea, PageHeader, Card, EmptyState, StatusBadge } from "@ai-sales/ui";

export default function ChannelHealthRoute() {
  return (
    <ContentArea>
      <PageHeader title="Sức khỏe kênh" description="Tổng hợp health đa tenant." />
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <StatusBadge label="MSW / ops stub" tone="neutral" />
          <EmptyState title="Chưa có tín hiệu live" description="Dimensions health sẽ nối ops channel API." />
        </div>
      </Card>
    </ContentArea>
  );
}
