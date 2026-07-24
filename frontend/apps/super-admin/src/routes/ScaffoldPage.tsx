import { ContentArea, PageHeader, Card, EmptyState } from "@ai-sales/ui";

export function ScaffoldPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <ContentArea>
      <PageHeader title={title} description={description} />
      <Card>
        <EmptyState
          title="Chưa có dữ liệu"
          description="Khung Super Admin đã sẵn sàng; nối API ops khi module tương ứng mở."
        />
      </Card>
    </ContentArea>
  );
}
