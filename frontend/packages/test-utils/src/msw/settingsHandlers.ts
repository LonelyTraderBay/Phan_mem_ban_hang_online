import { http, HttpResponse } from "msw";
import { buildGenericResource } from "../factories/genericResource";

const API_BASE_URL = "/api";

const members = [
  {
    id: "mem_001",
    display_name: "Nguyễn Văn A",
    email: "a@shop.local",
    status: "active",
    roles: ["admin"],
  },
  {
    id: "mem_002",
    display_name: "Trần Thị B",
    email: "b@shop.local",
    status: "invited",
    roles: ["staff"],
  },
];

const roles = [
  { id: "role_admin", name: "Quản trị viên", version: 1, permissions: ["member.read", "role.manage"] },
  { id: "role_staff", name: "Nhân viên", version: 2, permissions: ["catalog.read", "customer.read"] },
];

const devices = [
  { id: "dev_fixture", name: "Chrome — Windows", current: true, last_seen_at: "2026-07-22T10:00:00.000Z" },
  { id: "dev_mobile", name: "Safari — iPhone", current: false, last_seen_at: "2026-07-20T08:30:00.000Z" },
];

/**
 * READY-MOCK overrides for settings routes (members, roles, devices, invitations).
 * Matches Settings*Route paths — hand-written routes may differ from generated OpenAPI stubs.
 */
export const settingsHandlers = [
  http.get(`*${API_BASE_URL}/members`, () =>
    HttpResponse.json({
      data: members,
      page_info: { next_cursor: null, has_more: false },
      meta: { request_id: "req_members" },
    }),
  ),

  http.post(`*${API_BASE_URL}/invitations`, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { email?: string };
    return HttpResponse.json(
      {
        data: buildGenericResource({ email: body.email ?? "invite@shop.local", status: "pending" }),
        meta: { request_id: "req_invite" },
      },
      { status: 201 },
    );
  }),

  http.post(`*${API_BASE_URL}/members/invitations`, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { email?: string };
    return HttpResponse.json(
      {
        data: buildGenericResource({ email: body.email ?? "invite@shop.local", status: "pending" }),
        meta: { request_id: "req_invite" },
      },
      { status: 201 },
    );
  }),

  http.get(`*${API_BASE_URL}/roles`, () =>
    HttpResponse.json({
      data: roles,
      page_info: { next_cursor: null, has_more: false },
      meta: { request_id: "req_roles" },
    }),
  ),

  http.patch(`*${API_BASE_URL}/roles/:role_id`, async ({ params, request }) => {
    const body = (await request.json().catch(() => ({}))) as { name?: string };
    const role = roles.find((r) => r.id === params.role_id);
    if (!role) {
      return HttpResponse.json({ title: "Not found", status: 404 }, { status: 404 });
    }
    if (body.name) role.name = body.name;
    role.version += 1;
    return HttpResponse.json({ data: role, meta: { request_id: "req_role_patch" } });
  }),

  http.get(`*${API_BASE_URL}/devices`, () =>
    HttpResponse.json({
      data: devices,
      page_info: { next_cursor: null, has_more: false },
      meta: { request_id: "req_devices" },
    }),
  ),

  http.post(`*${API_BASE_URL}/devices/:device_id/revoke`, ({ params }) => {
    const idx = devices.findIndex((d) => d.id === params.device_id);
    if (idx === -1) {
      return HttpResponse.json({ title: "Device not found", status: 404 }, { status: 404 });
    }
    devices.splice(idx, 1);
    return HttpResponse.json({ data: {}, meta: { request_id: "req_device_revoke" } });
  }),

  http.delete(`*${API_BASE_URL}/devices/:device_id`, ({ params }) => {
    const idx = devices.findIndex((d) => d.id === params.device_id);
    if (idx !== -1) devices.splice(idx, 1);
    return new HttpResponse(null, { status: 204 });
  }),
];
