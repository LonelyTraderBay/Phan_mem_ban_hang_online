import { http, HttpResponse } from "msw";
import { buildGenericResource } from "../factories/genericResource";

const API_BASE_URL = "/api";

type ImportStatus = "pending" | "analyzing" | "ready" | "confirmed" | "cancelled" | "failed";

interface ImportJob {
  id: string;
  status: ImportStatus;
  file_name: string;
  row_count: number;
  version: number;
  created_at: string;
  updated_at: string;
}

const jobs = new Map<string, ImportJob>();

function ensureJob(jobId: string): ImportJob {
  let job = jobs.get(jobId);
  if (!job) {
    job = {
      id: jobId,
      status: "ready",
      file_name: "san-pham-mau.csv",
      row_count: 42,
      version: 1,
      created_at: "2026-07-22T08:00:00.000Z",
      updated_at: "2026-07-22T08:05:00.000Z",
    };
    jobs.set(jobId, job);
  }
  return job;
}

/** READY-MOCK overrides for catalog import job routes. */
export const importHandlers = [
  http.post(`*${API_BASE_URL}/imports`, async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as { file_name?: string };
    const resource = buildGenericResource({
      status: "pending",
      file_name: body.file_name ?? "import.csv",
      row_count: 0,
    });
    const job: ImportJob = {
      id: resource.id,
      status: "pending",
      file_name: body.file_name ?? "import.csv",
      row_count: 0,
      version: 1,
      created_at: resource.created_at,
      updated_at: resource.updated_at,
    };
    jobs.set(job.id, job);
    return HttpResponse.json({ data: job, meta: { request_id: "req_import_create" } }, { status: 201 });
  }),

  http.post(`*${API_BASE_URL}/imports/:job_id/analyze`, ({ params }) => {
    const job = ensureJob(String(params.job_id));
    job.status = "analyzing";
    job.updated_at = new Date().toISOString();
    return HttpResponse.json({ data: job, meta: { request_id: "req_import_analyze" } });
  }),

  http.get(`*${API_BASE_URL}/imports/:job_id`, ({ params }) => {
    const job = ensureJob(String(params.job_id));
    return HttpResponse.json({ data: job, meta: { request_id: "req_import_get" } });
  }),

  http.get(`*${API_BASE_URL}/imports/:job_id/preview`, ({ params }) =>
    HttpResponse.json({
      data: {
        job_id: params.job_id,
        rows: [
          { row: 1, sku: "AT-001", name: "Áo thun basic", valid: true },
          { row: 2, sku: "", name: "Thiếu SKU", valid: false },
        ],
        valid_count: 1,
        invalid_count: 1,
      },
      meta: { request_id: "req_import_preview" },
    }),
  ),

  http.put(`*${API_BASE_URL}/imports/:job_id/mapping`, async ({ params, request }) => {
    const job = ensureJob(String(params.job_id));
    const body = (await request.json().catch(() => ({}))) as Record<string, string>;
    job.status = "ready";
    job.version += 1;
    job.updated_at = new Date().toISOString();
    return HttpResponse.json({
      data: { ...job, mapping: body },
      meta: { request_id: "req_import_mapping" },
    });
  }),

  http.get(`*${API_BASE_URL}/imports/:job_id/errors`, () =>
    HttpResponse.json({
      data: [{ row: 2, field: "sku", message: "SKU bắt buộc" }],
      meta: { request_id: "req_import_errors" },
    }),
  ),

  http.post(`*${API_BASE_URL}/imports/:job_id/cancel`, ({ params }) => {
    const job = ensureJob(String(params.job_id));
    job.status = "cancelled";
    job.updated_at = new Date().toISOString();
    return HttpResponse.json({ data: job, meta: { request_id: "req_import_cancel" } });
  }),

  http.post(`*${API_BASE_URL}/imports/:job_id/confirm`, ({ params }) => {
    const job = ensureJob(String(params.job_id));
    job.status = "confirmed";
    job.row_count = 41;
    job.updated_at = new Date().toISOString();
    return HttpResponse.json({ data: job, meta: { request_id: "req_import_confirm" } });
  }),
];
