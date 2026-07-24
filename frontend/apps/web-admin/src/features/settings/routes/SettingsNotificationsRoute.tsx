import { Card, ContentArea, EmptyState, PageHeader } from "@ai-sales/ui";

export default function SettingsNotificationsRoute() {
  return (
    <ContentArea>
      <PageHeader
        title="Thông báo"
        description="Kênh và tùy chọn thông báo cho đội."
      />
      <Card>
        <EmptyState
          title="Tùy chọn thông báo đang chờ hợp đồng API"
          description="Chưa có resource hoặc operation frozen cho notification preferences trong OpenAPI tenant-api. Xem docs/collaboration/CONTRACT_GAP_BILLING_NOTIFICATIONS.md — không thêm trường giả lập."
        />
        <p
          style={{
            marginTop: "var(--ai-sales-spacing-4)",
            color: "var(--ai-sales-color-text-muted)",
            fontSize: "var(--ai-sales-font-size-sm)",
          }}
        >
          Email và push toggles sẽ xuất hiện tại đây khi BE freeze preference schema.
        </p>
      </Card>
    </ContentArea>
  );
}
