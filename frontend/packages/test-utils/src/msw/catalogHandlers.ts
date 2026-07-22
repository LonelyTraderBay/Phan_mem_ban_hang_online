import { http, HttpResponse } from "msw";

const API_BASE_URL = "/api";

interface ProductRow {
  id: string;
  name: string;
  sku?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

const products: ProductRow[] = [
  {
    id: "prd_001",
    name: "Áo thun basic",
    sku: "AT-001",
    version: 1,
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-03-01T00:00:00.000Z",
  },
  {
    id: "prd_002",
    name: "Quần jean slim",
    sku: "QJ-002",
    version: 2,
    created_at: "2026-03-10T00:00:00.000Z",
    updated_at: "2026-04-01T00:00:00.000Z",
  },
];

/** READY-MOCK overrides for product catalog list/detail routes. */
export const catalogHandlers = [
  http.get(`*${API_BASE_URL}/products`, () =>
    HttpResponse.json({
      data: products,
      page_info: { next_cursor: null, has_more: false },
      meta: { request_id: "req_products" },
    }),
  ),

  http.get(`*${API_BASE_URL}/products/:product_id`, ({ params }) => {
    const product = products.find((p) => p.id === params.product_id);
    if (!product) {
      return HttpResponse.json({ title: "Not found", status: 404 }, { status: 404 });
    }
    return HttpResponse.json({ data: product, meta: { request_id: "req_product_get" } });
  }),

  http.patch(`*${API_BASE_URL}/products/:product_id`, async ({ params, request }) => {
    const product = products.find((p) => p.id === params.product_id);
    if (!product) {
      return HttpResponse.json({ title: "Not found", status: 404 }, { status: 404 });
    }
    const body = (await request.json().catch(() => ({}))) as { name?: string; sku?: string };
    if (body.name) product.name = body.name;
    if (body.sku) product.sku = body.sku;
    product.version += 1;
    product.updated_at = new Date().toISOString();
    return HttpResponse.json({ data: product, meta: { request_id: "req_product_patch" } });
  }),
];
