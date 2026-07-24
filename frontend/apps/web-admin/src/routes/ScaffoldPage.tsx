import { ContentArea, PageHeader, Card, EmptyState } from "@ai-sales/ui";

export interface ScaffoldPageProps {
  title: string;
  description: string;
  emptyTitle?: string;
  emptyDescription?: string;
}

/** READY-MOCK shell for routes without live data yet. */
export function ScaffoldPage({
  title,
  description,
  emptyTitle = "Chưa có dữ liệu",
  emptyDescription = "Màn hình này đã có khung enterprise; dữ liệu sẽ nối khi module tương ứng sẵn sàng.",
}: ScaffoldPageProps) {
  return (
    <ContentArea>
      <PageHeader title={title} description={description} />
      <Card>
        <EmptyState title={emptyTitle} description={emptyDescription} />
      </Card>
    </ContentArea>
  );
}
