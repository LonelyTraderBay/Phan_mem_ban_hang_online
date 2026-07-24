import { http, HttpResponse } from "msw";

const API_BASE_URL = "/api";

const orders = [
  { id: "ord_001", status: "confirmed", currency: "VND", total_minor: 15000000, version: 1 },
  { id: "ord_002", status: "draft", currency: "VND", total_minor: 4200000, version: 1 },
];

const aiLogs = [
  { id: "ail_001", summary: "Gợi ý trả lời hội thoại #c1", status: "ok" },
];

const blocked = [
  { id: "blk_001", summary: "Output chứa PII — đã chặn", status: "blocked" },
];

export const orderHandlers = [
  http.get(`*${API_BASE_URL}/orders`, () =>
    HttpResponse.json({
      data: orders,
      page_info: { next_cursor: null, has_more: false },
      meta: { request_id: "req_orders" },
    }),
  ),
  http.get(`*${API_BASE_URL}/orders/:order_id`, ({ params }) => {
    const order = orders.find((o) => o.id === params.order_id);
    if (!order) {
      return HttpResponse.json(
        { type: "about:blank", title: "Not found", status: 404, code: "RESOURCE_NOT_FOUND" },
        { status: 404 },
      );
    }
    return HttpResponse.json({ data: order, meta: { request_id: "req_order" } });
  }),
];

export const aiHandlers = [
  http.get(`*${API_BASE_URL}/ai/logs`, () =>
    HttpResponse.json({ data: aiLogs, meta: { request_id: "req_ai_logs" } }),
  ),
  http.get(`*${API_BASE_URL}/ai/blocked-outputs`, () =>
    HttpResponse.json({ data: blocked, meta: { request_id: "req_ai_blocked" } }),
  ),
];
