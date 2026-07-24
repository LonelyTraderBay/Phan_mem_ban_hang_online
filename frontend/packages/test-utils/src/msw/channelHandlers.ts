import { http, HttpResponse } from "msw";

const API_BASE_URL = "/api";
const TENANT_ID = "00000000-0000-0000-0000-000000000001";

interface ChannelRow {
  id: string;
  tenant_id: string;
  provider: string;
  display_name: string | null;
  status: string;
  health: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

const accounts: ChannelRow[] = [
  {
    id: "00000000-0000-0000-0000-000000000401",
    tenant_id: TENANT_ID,
    provider: "facebook",
    display_name: "Fanpage Shop ABC",
    status: "active",
    health: "ok",
    version: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000402",
    tenant_id: TENANT_ID,
    provider: "zalo",
    display_name: "Zalo OA",
    status: "degraded",
    health: "warn",
    version: 1,
    created_at: "2026-01-15T00:00:00.000Z",
    updated_at: "2026-03-05T00:00:00.000Z",
  },
];

/** READY-MOCK overrides for channel accounts list. */
export const channelHandlers = [
  http.get(`*${API_BASE_URL}/channels/accounts`, () =>
    HttpResponse.json({
      data: accounts,
      page_info: { next_cursor: null, has_more: false },
      meta: { request_id: "req_channels" },
    }),
  ),

  http.get(`*${API_BASE_URL}/channels/accounts/:account_id`, ({ params }) => {
    const account = accounts.find((item) => item.id === params.account_id);
    if (!account) {
      return HttpResponse.json(
        { type: "about:blank", title: "Not found", status: 404, code: "RESOURCE_NOT_FOUND" },
        { status: 404 },
      );
    }
    return HttpResponse.json({ data: account, meta: { request_id: "req_channel" } });
  }),
];
