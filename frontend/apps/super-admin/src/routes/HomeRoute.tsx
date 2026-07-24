import { ContentArea, PageHeader, Card, EmptyState, StatusBadge } from "@ai-sales/ui";

export default function HomeRoute() {
  return (
    <ContentArea>
      <PageHeader
        title="Tổng quan Super Admin"
        description="Theo dõi sức khỏe hệ thống, tenant và cảnh báo vận hành."
      />
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <StatusBadge label="Ops portal READY-MOCK" tone="success" />
          <StatusBadge label="Session tách ADR-FE-004" tone="info" />
          <EmptyState
            title="Chưa có tín hiệu live"
            description="Dùng menu Tenants / Alerts / Flags khi API ops sẵn sàng. Không dùng cookie web-admin."
          />
        </div>
      </Card>
    </ContentArea>
  );
}
