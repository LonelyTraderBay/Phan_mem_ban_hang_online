import { http, HttpResponse } from "msw";

const API_BASE_URL = "/api";
const TENANT_ID = "00000000-0000-0000-0000-000000000001";

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

const conversations: ConversationRow[] = [
  {
    id: "00000000-0000-0000-0000-000000000501",
    tenant_id: TENANT_ID,
    channel_account_id: "00000000-0000-0000-0000-000000000401",
    customer_id: "cus_001",
    assignee_member_id: null,
    status: "open",
    ai_takeover: true,
    version: 1,
    created_at: "2026-03-10T09:00:00.000Z",
    updated_at: "2026-03-10T09:30:00.000Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000502",
    tenant_id: TENANT_ID,
    channel_account_id: "00000000-0000-0000-0000-000000000402",
    customer_id: "cus_002",
    assignee_member_id: "mem_fixture",
    status: "pending",
    ai_takeover: false,
    version: 1,
    created_at: "2026-03-11T14:00:00.000Z",
    updated_at: "2026-03-11T14:15:00.000Z",
  },
];

function listResponse() {
  return HttpResponse.json({
    data: conversations,
    page_info: { next_cursor: null, has_more: false },
    meta: { request_id: "req_conversations" },
  });
}

/** READY-MOCK overrides for inbox conversation list/detail. */
export const conversationHandlers = [
  http.get(`*${API_BASE_URL}/conversations`, () => listResponse()),

  http.get(`*${API_BASE_URL}/conversations/:conversation_id`, ({ params }) => {
    const row = conversations.find((c) => c.id === params.conversation_id);
    if (!row) {
      return HttpResponse.json({ title: "Not found", status: 404 }, { status: 404 });
    }
    return HttpResponse.json({ data: row, meta: { request_id: "req_conversation_get" } });
  }),
];
