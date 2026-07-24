import {
  Card,
  ContentArea,
  DataList,
  DataListItem,
  EmptyState,
  PageHeader,
  StatusBadge,
} from "@ai-sales/ui";
import { METRIC_CATALOG } from "../../../generated/metricCatalog";

const metrics = [...METRIC_CATALOG.metrics];

export default function ReportsRoute() {
  return (
    <ContentArea>
      <PageHeader title="Báo cáo" description="Báo cáo vận hành và hiệu suất bán hàng." />
      <Card>
        {metrics.length === 0 ? (
          <EmptyState
            title="Chưa có metric trong catalog"
            description="Catalog backend đang rỗng; đồng bộ lại contracts trước khi hiển thị báo cáo."
          />
        ) : (
          <DataList>
            {metrics.map((metric) => (
              <DataListItem
                key={metric.id}
                primary={metric.label}
                secondary={metric.id}
                meta={<StatusBadge label="READY-MOCK" tone="neutral" />}
              />
            ))}
          </DataList>
        )}
      </Card>
    </ContentArea>
  );
}
