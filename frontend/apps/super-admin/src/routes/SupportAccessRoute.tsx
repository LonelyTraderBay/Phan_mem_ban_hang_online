import { ContentArea, PageHeader, Card, EmptyState, StatusBadge } from "@ai-sales/ui";

export default function SupportAccessRoute() {
  return (
    <ContentArea>
      <PageHeader
        title="Support access"
        description="Elevation có thời hạn — session tách web-admin (ADR-FE-004)."
      />
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <StatusBadge label="Không có elevation đang mở" tone="neutral" />
          <EmptyState
            title="READY-MOCK"
            description="Nối ops support-access API khi Super Admin auth sống. Không dùng cookie tenant web-admin."
          />
        </div>
      </Card>
    </ContentArea>
  );
}
