import { http, HttpResponse } from "msw";
import { buildGenericResource } from "../factories/genericResource";

const API_BASE_URL = "/api";

interface CustomerRow {
  id: string;
  display_name: string;
  email?: string;
  phone?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

const customers: CustomerRow[] = [
  {
    id: "cus_001",
    display_name: "Khách hàng VIP",
    email: "vip@example.com",
    phone: "0901234567",
    version: 1,
    created_at: "2026-01-15T00:00:00.000Z",
    updated_at: "2026-01-15T00:00:00.000Z",
  },
  {
    id: "cus_002",
    display_name: "Khách lẻ",
    email: "le@example.com",
    phone: "0912345678",
    version: 1,
    created_at: "2026-02-01T00:00:00.000Z",
    updated_at: "2026-02-01T00:00:00.000Z",
  },
];

function listResponse(data: CustomerRow[]) {
  return HttpResponse.json({
    data,
    page_info: { next_cursor: null, has_more: false },
    meta: { request_id: "req_customers" },
  });
}

/** READY-MOCK overrides for customer list/detail/merge routes. */
export const customerHandlers = [
  http.get(`*${API_BASE_URL}/customers`, () => listResponse(customers)),

  http.get(`*${API_BASE_URL}/customers/:customer_id`, ({ params }) => {
    const customer = customers.find((c) => c.id === params.customer_id);
    if (!customer) {
      return HttpResponse.json({ title: "Not found", status: 404 }, { status: 404 });
    }
    return HttpResponse.json({ data: customer, meta: { request_id: "req_customer_get" } });
  }),

  http.post(`*${API_BASE_URL}/customers/merge-preview`, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      source_customer_id?: string;
      target_customer_id?: string;
    };
    return HttpResponse.json({
      data: {
        source_customer_id: body.source_customer_id ?? "cus_002",
        target_customer_id: body.target_customer_id ?? "cus_001",
        preview: { identities_merged: 1, addresses_merged: 0, tags_merged: 2 },
      },
      meta: { request_id: "req_merge_preview" },
    });
  }),

  http.post(`*${API_BASE_URL}/customers/merge`, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      source_customer_id?: string;
      target_customer_id?: string;
    };
    const sourceId = body.source_customer_id;
    if (sourceId) {
      const idx = customers.findIndex((c) => c.id === sourceId);
      if (idx !== -1) customers.splice(idx, 1);
    }
    const target = customers.find((c) => c.id === body.target_customer_id) ?? customers[0];
    return HttpResponse.json({
      data: buildGenericResource({ ...target, version: target.version + 1 }),
      meta: { request_id: "req_merge" },
    });
  }),
];
