import { http, HttpResponse } from "msw";

const API_BASE_URL = "/api";
const TENANT_ID = "00000000-0000-0000-0000-000000000001";

interface KnowledgeRow {
  id: string;
  tenant_id: string;
  title: string | null;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

const sources: KnowledgeRow[] = [
  {
    id: "00000000-0000-0000-0000-000000000301",
    tenant_id: TENANT_ID,
    title: "Chính sách đổi trả",
    status: "published",
    version: 2,
    created_at: "2026-01-05T00:00:00.000Z",
    updated_at: "2026-02-01T00:00:00.000Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000302",
    tenant_id: TENANT_ID,
    title: "FAQ sản phẩm",
    status: "draft",
    version: 1,
    created_at: "2026-02-10T00:00:00.000Z",
    updated_at: "2026-02-10T00:00:00.000Z",
  },
];

/** READY-MOCK overrides for knowledge sources list. */
export const knowledgeHandlers = [
  http.get(`*${API_BASE_URL}/knowledge/sources`, () =>
    HttpResponse.json({
      data: sources,
      page_info: { next_cursor: null, has_more: false },
      meta: { request_id: "req_knowledge" },
    }),
  ),
];
