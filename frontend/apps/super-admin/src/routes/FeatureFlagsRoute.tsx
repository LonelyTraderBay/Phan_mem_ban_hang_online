import { ContentArea, PageHeader, Card, DataList, DataListItem, StatusBadge, EmptyState } from "@ai-sales/ui";

const MOCK_FLAGS = [
  { id: "ff_ai_suggest", key: "ai.suggestions", enabled: true },
  { id: "ff_inbox_sse", key: "inbox.realtime", enabled: false },
];

export default function FeatureFlagsRoute() {
  return (
    <ContentArea>
      <PageHeader title="Feature flags" description="Cờ nền tảng — fail-closed khi tắt." />
      <Card>
        {MOCK_FLAGS.length === 0 ? (
          <EmptyState title="Chưa có flag" />
        ) : (
          <DataList>
            {MOCK_FLAGS.map((f) => (
              <DataListItem
                key={f.id}
                primary={f.key}
                meta={<StatusBadge label={f.enabled ? "on" : "off"} tone={f.enabled ? "success" : "neutral"} />}
              />
            ))}
          </DataList>
        )}
      </Card>
    </ContentArea>
  );
}
