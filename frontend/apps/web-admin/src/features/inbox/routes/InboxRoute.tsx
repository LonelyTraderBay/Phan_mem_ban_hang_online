import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import {
  createConnectionStatusStore,
  createSseClient,
  useConnectionStatus,
  type SseConnectionState,
} from "@ai-sales/realtime";
import {
  Card,
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
import { useAppConfig } from "../../../app/AppConfigContext";

interface ConversationRow {
  id: string;
  tenant_id: string;
  channel_account_id: string | null;
  customer_id: string | null;
  assignee_member_id: string | null;
  status: string;
  ai_takeover: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger"> = {
  open: "success",
  pending: "warning",
  resolved: "neutral",
  closed: "neutral",
};

const REALTIME_LABEL: Record<SseConnectionState, string> = {
  closed: "đã tắt",
  connecting: "đang kết nối",
  connected: "đã kết nối",
  reconnecting: "đang kết nối lại",
  offline: "ngoại tuyến",
  resyncing: "đang đồng bộ",
};

const REALTIME_TONE: Record<SseConnectionState, "neutral" | "success" | "warning" | "danger"> = {
  closed: "neutral",
  connecting: "warning",
  connected: "success",
  reconnecting: "warning",
  offline: "danger",
  resyncing: "warning",
};

const LAST_EVENT_ID_KEY = "ai-sales.inbox.lastEventId";

function readPersistedLastEventId(): string | null {
  try {
    return sessionStorage.getItem(LAST_EVENT_ID_KEY);
  } catch {
    return null;
  }
}

function writePersistedLastEventId(id: string): void {
  try {
    sessionStorage.setItem(LAST_EVENT_ID_KEY, id);
  } catch {
    // Private mode / quota — in-memory resume still works for this page session.
  }
}

function isConversationRealtimeEvent(type: string): boolean {
  return type.startsWith("com.aisales.conversation.");
}

export default function InboxRoute() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const allowed = usePermission("conversation.read");
  const { authenticatedClient } = useAuth();
  const { sseUrl } = useAppConfig();
  const realtimeStore = useMemo(() => createConnectionStatusStore(), []);
  const realtimeState = useConnectionStatus(realtimeStore);
  const lastEventIdRef = useRef<string | null>(readPersistedLastEventId());
  const conversationIdRef = useRef(conversationId);
  const [conversations, setConversations] = useState<ConversationRow[] | null>(null);
  const [detail, setDetail] = useState<ConversationRow | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  conversationIdRef.current = conversationId;

  async function loadList() {
    setLoadingList(true);
    setError(null);
    const result = await authenticatedClient.request<{ data?: ConversationRow[] }>("/conversations", {
      method: "GET",
    });
    setLoadingList(false);
    if (!result.ok) {
      setError(result.problem?.code ?? `HTTP_${result.status}`);
      return;
    }
    setConversations(result.data.data ?? []);
  }

  async function loadDetail(id: string) {
    setLoadingDetail(true);
    setError(null);
    const result = await authenticatedClient.request<{ data?: ConversationRow }>(`/conversations/${id}`, {
      method: "GET",
    });
    setLoadingDetail(false);
    if (!result.ok) {
      setError(result.problem?.code ?? `HTTP_${result.status}`);
      setDetail(null);
      return;
    }
    setDetail(result.data.data ?? null);
  }

  useEffect(() => {
    if (!allowed) return;

    const client = createSseClient({
      url: sseUrl,
      onEnvelope: (envelope) => {
        if (!isConversationRealtimeEvent(envelope.type)) return;
        void loadList();
        const openId = conversationIdRef.current;
        if (openId) void loadDetail(openId);
      },
      onStateChange: realtimeStore.setState,
      onResyncRequired: () => {
        void loadList();
        const openId = conversationIdRef.current;
        if (openId) void loadDetail(openId);
      },
      getLastEventId: () => lastEventIdRef.current,
      setLastEventId: (id) => {
        lastEventIdRef.current = id;
        writePersistedLastEventId(id);
      },
    });

    client.start();
    return () => client.stop();
  }, [allowed, authenticatedClient, realtimeStore, sseUrl]);

  useEffect(() => {
    if (allowed) void loadList();
    else setLoadingList(false);
  }, [allowed]);

  useEffect(() => {
    if (allowed && conversationId) void loadDetail(conversationId);
    else setDetail(null);
  }, [allowed, conversationId]);

  return (
    <PermissionGate
      allowed={allowed}
      fallback={<ForbiddenState message="Bạn không có quyền xem hộp thư." />}
    >
      <ContentArea>
        <PageHeader
          title="Hộp thư thông minh"
          description="Hội thoại đa kênh và gợi ý AI cho đội bán hàng."
          actions={
            <StatusBadge
              label={`Realtime: ${REALTIME_LABEL[realtimeState]}`}
              tone={REALTIME_TONE[realtimeState]}
            />
          }
        />
        {error ? (
          <ErrorPanel
            title="Không thể tải hội thoại"
            code={error}
            retryable
            onRetry={() => {
              void loadList();
              if (conversationId) void loadDetail(conversationId);
            }}
          />
        ) : null}
        <div style={{ display: "grid", gridTemplateColumns: conversationId ? "1fr 1fr" : "1fr", gap: "1rem" }}>
          <section aria-label="Danh sách hội thoại">
            {loadingList ? (
              <Skeleton height={200} aria-label="Đang tải danh sách" />
            ) : !conversations || conversations.length === 0 ? (
              <EmptyState title="Chưa có hội thoại nào." />
            ) : (
              <DataList>
                {conversations.map((c) => (
                  <DataListItem
                    key={c.id}
                    primary={
                      <Link
                        to={`/inbox/${c.id}`}
                        style={{
                          color: "inherit",
                          textDecoration: conversationId === c.id ? "underline" : "none",
                          fontWeight: conversationId === c.id ? 600 : 500,
                        }}
                      >
                        {c.id}
                      </Link>
                    }
                    secondary={`Khách: ${c.customer_id ?? "—"} · Kênh: ${c.channel_account_id ?? "—"}`}
                    meta={<StatusBadge label={c.status} tone={STATUS_TONE[c.status] ?? "neutral"} />}
                  />
                ))}
              </DataList>
            )}
          </section>
          {conversationId ? (
            <section aria-label="Chi tiết hội thoại">
              {loadingDetail ? (
                <Skeleton height={200} aria-label="Đang tải chi tiết" />
              ) : !detail ? (
                <EmptyState title="Không tìm thấy hội thoại." />
              ) : (
                <Card>
                  <p style={{ marginTop: 0 }}>
                    <StatusBadge label={detail.status} tone={STATUS_TONE[detail.status] ?? "neutral"} />
                  </p>
                  <dl style={{ margin: 0, fontSize: "0.875rem" }}>
                    <dt>Khách hàng</dt>
                    <dd>{detail.customer_id ?? "—"}</dd>
                    <dt>Kênh</dt>
                    <dd>{detail.channel_account_id ?? "—"}</dd>
                    <dt>Phụ trách</dt>
                    <dd>{detail.assignee_member_id ?? "—"}</dd>
                    <dt>AI takeover</dt>
                    <dd>{detail.ai_takeover ? "Có" : "Không"}</dd>
                  </dl>
                </Card>
              )}
            </section>
          ) : null}
        </div>
      </ContentArea>
    </PermissionGate>
  );
}
