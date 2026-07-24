import { ContentArea, PageHeader, Card, EmptyState } from "@ai-sales/ui";

export default function BillingRoute() {
  return (
    <ContentArea>
      <PageHeader title="Thanh toán & usage" description="Gói dịch vụ và mức sử dụng — theo HO_DEFAULTS_v1." />
      <Card>
        <EmptyState
          title="Billing READY-MOCK"
          description="UI shell giữ EmptyState cho đến khi slice FE-BIL bind contract. Xem docs/collaboration/CONTRACT_GAP_BILLING_NOTIFICATIONS.md — không thêm field giá, meter hoặc invoice từ design sketch."
        />
      </Card>
    </ContentArea>
  );
}
