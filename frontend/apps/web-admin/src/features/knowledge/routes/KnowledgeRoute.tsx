import { useEffect, useState } from "react";
import {
  ContentArea,
  DataList,
  DataListItem,
  EmptyState,
  ErrorPanel,
  ForbiddenState,
  PageHeader,
  PermissionGate,
  Skeleton,
  StatusBadge,
} from "@ai-sales/ui";
import { usePermission } from "@ai-sales/permissions";
import { useAuth } from "../../../app/AuthProvider";

interface KnowledgeRow {
  id: string;
  tenant_id: string;
  title: string | null;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  in_review: "warning",
  approved: "success",
  published: "success",
  archived: "neutral",
};

export default function KnowledgeRoute() {
  const allowed = usePermission("knowledge.read");
  const { authenticatedClient } = useAuth();
  const [sources, setSources] = useState<KnowledgeRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const result = await authenticatedClient.request<{ data?: KnowledgeRow[] }>("/knowledge/sources", {
      method: "GET",
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.problem?.code ?? `HTTP_${result.status}`);
      return;
    }
    setSources(result.data.data ?? []);
  }

  useEffect(() => {
    if (allowed) void load();
    else setLoading(false);
  }, [allowed]);

  return (
    <PermissionGate
      allowed={allowed}
      fallback={<ForbiddenState message="Bạn không có quyền xem nguồn tri thức." />}
    >
      <ContentArea>
        <PageHeader title="Tri thức & chính sách" description="Nguồn kiến thức cho AI và đội hỗ trợ." />
        {error ? (
          <ErrorPanel title="Không thể tải nguồn tri thức" code={error} retryable onRetry={() => void load()} />
        ) : null}
        {loading ? (
          <Skeleton height={120} aria-label="Đang tải nguồn tri thức" />
        ) : !sources || sources.length === 0 ? (
          <EmptyState title="Chưa có nguồn tri thức nào." />
        ) : (
          <DataList>
            {sources.map((s) => (
              <DataListItem
                key={s.id}
                primary={s.title ?? s.id}
                secondary={`Cập nhật: ${s.updated_at}`}
                meta={<StatusBadge label={s.status} tone={STATUS_TONE[s.status] ?? "neutral"} />}
              />
            ))}
          </DataList>
        )}
      </ContentArea>
    </PermissionGate>
  );
}
