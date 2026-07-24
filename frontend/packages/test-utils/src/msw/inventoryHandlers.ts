import { http, HttpResponse } from "msw";

const API_BASE_URL = "/api";
const TENANT_ID = "00000000-0000-0000-0000-000000000001";

interface InventoryRow {
  id: string;
  tenant_id: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

const balances: InventoryRow[] = [
  {
    id: "00000000-0000-0000-0000-000000000101",
    tenant_id: TENANT_ID,
    status: "available",
    version: 1,
    created_at: "2026-01-10T00:00:00.000Z",
    updated_at: "2026-01-10T00:00:00.000Z",
  },
];

const movements: InventoryRow[] = [
  {
    id: "00000000-0000-0000-0000-000000000201",
    tenant_id: TENANT_ID,
    status: "posted",
    version: 1,
    created_at: "2026-01-12T08:00:00.000Z",
    updated_at: "2026-01-12T08:00:00.000Z",
  },
];

function listResponse(data: InventoryRow[]) {
  return HttpResponse.json({
    data,
    page_info: { next_cursor: null, has_more: false },
    meta: { request_id: "req_inventory" },
  });
}

/** READY-MOCK overrides for inventory balances and movements. */
export const inventoryHandlers = [
  http.get(`*${API_BASE_URL}/inventory/balances`, () => listResponse(balances)),
  http.get(`*${API_BASE_URL}/inventory/movements`, () => listResponse(movements)),
];
