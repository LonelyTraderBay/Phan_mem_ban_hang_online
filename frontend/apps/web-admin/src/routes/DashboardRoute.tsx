import {
  Card,
  ContentArea,
  DataList,
  DataListItem,
  EmptyState,
  PageHeader,
  StatusBadge,
} from "@ai-sales/ui";
import { METRIC_CATALOG } from "../generated/metricCatalog";

const metrics = [...METRIC_CATALOG.metrics];

export default function DashboardRoute() {
  return (
    <ContentArea>
      <PageHeader
        title="Tổng quan"
        description="Theo dõi hoạt động bán hàng và trạng thái vận hành trong ngày."
      />
      <Card>
        {metrics.length === 0 ? (
          <EmptyState
            title="Chưa có metric trong catalog"
            description="Catalog backend đang rỗng; đồng bộ lại contracts trước khi hiển thị KPI."
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
