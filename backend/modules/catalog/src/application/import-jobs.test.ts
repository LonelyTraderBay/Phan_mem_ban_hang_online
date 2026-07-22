import { describe, expect, it } from "vitest";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import {
  analyzeImport,
  cancelImport,
  confirmImport,
  createImportJob,
  getImportErrors,
  getImportJob,
  getImportMetrics,
  getImportPreview,
  updateImportMapping
} from "./import-jobs.js";
import { InMemoryCatalogRepository } from "../infrastructure/persistence/in-memory-catalog.js";
import {
  createInMemoryImportApplyPort,
  InMemoryImportRepository
} from "../infrastructure/persistence/in-memory-import.js";
import { listVariants } from "./catalog.js";

const tenantA = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1b");
const importPerms = ["catalog.import", "catalog.read", "catalog.write"];

describe("BE-IMP-001 import job/staging", () => {
  it("creates job uploaded and get maps to JobResponse queued", async () => {
    const repo = new InMemoryImportRepository();
    const created = await createImportJob({
      repo,
      tenantId: tenantA,
      actorPermissions: importPerms,
      idempotencyKey: "imp-1",
      sourceType: "csv"
    });
    expect(created.data.status).toBe("queued");
    expect(created.data.status_url).toContain(created.data.job_id);

    const got = await getImportJob({
      repo,
      tenantId: tenantA,
      actorPermissions: importPerms,
      jobId: created.data.job_id
    });
    expect(got.data.status).toBe("queued");
  });

  it("requires catalog.import and Idempotency-Key", async () => {
    const repo = new InMemoryImportRepository();
    await expect(
      createImportJob({
        repo,
        tenantId: tenantA,
        actorPermissions: ["catalog.write"],
        idempotencyKey: "x",
        sourceType: "csv"
      })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_PERMISSION" });
    await expect(
      createImportJob({
        repo,
        tenantId: tenantA,
        actorPermissions: importPerms,
        sourceType: "csv"
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });
  });
});

describe("BE-IMP-002 analyze/parse", () => {
  it("analyzes default CSV into staged rows + mapping", async () => {
    const repo = new InMemoryImportRepository();
    const created = await createImportJob({
      repo,
      tenantId: tenantA,
      actorPermissions: importPerms,
      idempotencyKey: "a1",
      sourceType: "csv"
    });
    const analyzed = await analyzeImport({
      repo,
      tenantId: tenantA,
      actorPermissions: importPerms,
      idempotencyKey: "an1",
      jobId: created.data.job_id
    });
    expect(analyzed.data.status).toBe("completed");
    const job = await repo.getJob({ tenantId: tenantA, jobId: created.data.job_id });
    expect(job?.status).toBe("mapped");
    expect(job?.rowCount).toBe(2);
    expect(job?.mapping.sku).toBe("sku");
  });

  it("rejects invalid file content", async () => {
    const repo = new InMemoryImportRepository();
    const created = await createImportJob({
      repo,
      tenantId: tenantA,
      actorPermissions: importPerms,
      idempotencyKey: "bad",
      sourceType: "csv"
    });
    await expect(
      analyzeImport({
        repo,
        tenantId: tenantA,
        actorPermissions: importPerms,
        idempotencyKey: "bad-an",
        jobId: created.data.job_id,
        csvContent: "\0bad"
      })
    ).rejects.toMatchObject({ code: "IMPORT_FILE_INVALID" });
  });
});

describe("BE-IMP-003 preview/mapping/errors", () => {
  it("builds preview with checksum and reports errors", async () => {
    const repo = new InMemoryImportRepository();
    const created = await createImportJob({
      repo,
      tenantId: tenantA,
      actorPermissions: importPerms,
      idempotencyKey: "p1",
      sourceType: "csv"
    });
    await analyzeImport({
      repo,
      tenantId: tenantA,
      actorPermissions: importPerms,
      idempotencyKey: "pan",
      jobId: created.data.job_id,
      csvContent: "sku,name,unit_price_minor\nA,Alpha,100\n,MissingName,200\n"
    });
    const preview = await getImportPreview({
      repo,
      tenantId: tenantA,
      actorPermissions: importPerms,
      jobId: created.data.job_id
    });
    expect(preview.data.status).toBe("preview_ready");
    expect(preview.data.error_count).toBe(1);

    const errors = await getImportErrors({
      repo,
      tenantId: tenantA,
      actorPermissions: importPerms,
      jobId: created.data.job_id
    });
    expect(errors.data.error_count).toBe(1);

    const job = await repo.getJob({ tenantId: tenantA, jobId: created.data.job_id });
    await updateImportMapping({
      repo,
      tenantId: tenantA,
      actorPermissions: importPerms,
      jobId: created.data.job_id,
      expectedVersion: job!.version,
      mapping: { sku: "sku", name: "name", unit_price_minor: "unit_price_minor" }
    });
  });
});

describe("BE-IMP-004 confirm/apply", () => {
  it("applies valid preview into catalog variants idempotently", async () => {
    const importRepo = new InMemoryImportRepository();
    const catalog = new InMemoryCatalogRepository();
    const applyPort = createInMemoryImportApplyPort(catalog);
    const created = await createImportJob({
      repo: importRepo,
      tenantId: tenantA,
      actorPermissions: importPerms,
      idempotencyKey: "c1",
      sourceType: "csv"
    });
    await analyzeImport({
      repo: importRepo,
      tenantId: tenantA,
      actorPermissions: importPerms,
      idempotencyKey: "can",
      jobId: created.data.job_id,
      csvContent: "sku,name,unit_price_minor\nIMP-1,Imported One,15000\n"
    });
    await getImportPreview({
      repo: importRepo,
      tenantId: tenantA,
      actorPermissions: importPerms,
      jobId: created.data.job_id
    });
    const confirmed = await confirmImport({
      repo: importRepo,
      applyPort,
      tenantId: tenantA,
      actorPermissions: importPerms,
      idempotencyKey: "confirm-1",
      jobId: created.data.job_id
    });
    expect(confirmed.data.status).toBe("completed");
    const variants = await listVariants({
      repo: catalog,
      tenantId: tenantA,
      actorPermissions: importPerms
    });
    expect(variants.data.some((v) => v.name === "IMP-1")).toBe(true);

    const replay = await confirmImport({
      repo: importRepo,
      applyPort,
      tenantId: tenantA,
      actorPermissions: importPerms,
      idempotencyKey: "confirm-1",
      jobId: created.data.job_id
    });
    expect(replay.data.job_id).toBe(confirmed.data.job_id);
  });

  it("rejects confirm when errors remain", async () => {
    const importRepo = new InMemoryImportRepository();
    const catalog = new InMemoryCatalogRepository();
    const created = await createImportJob({
      repo: importRepo,
      tenantId: tenantA,
      actorPermissions: importPerms,
      idempotencyKey: "cerr",
      sourceType: "csv"
    });
    await analyzeImport({
      repo: importRepo,
      tenantId: tenantA,
      actorPermissions: importPerms,
      idempotencyKey: "cerr-an",
      jobId: created.data.job_id,
      csvContent: "sku,name\n,NoSku\n"
    });
    await getImportPreview({
      repo: importRepo,
      tenantId: tenantA,
      actorPermissions: importPerms,
      jobId: created.data.job_id
    });
    await expect(
      confirmImport({
        repo: importRepo,
        applyPort: createInMemoryImportApplyPort(catalog),
        tenantId: tenantA,
        actorPermissions: importPerms,
        idempotencyKey: "cerr-c",
        jobId: created.data.job_id
      })
    ).rejects.toMatchObject({ code: "IMPORT_JOB_STATE_INVALID" });
  });
});

describe("BE-IMP-005 cancel/metrics", () => {
  it("cancels before apply and records metrics", async () => {
    const repo = new InMemoryImportRepository();
    const created = await createImportJob({
      repo,
      tenantId: tenantA,
      actorPermissions: importPerms,
      idempotencyKey: "z1",
      sourceType: "csv"
    });
    const cancelled = await cancelImport({
      repo,
      tenantId: tenantA,
      actorPermissions: importPerms,
      idempotencyKey: "z-cancel",
      jobId: created.data.job_id
    });
    expect(cancelled.data.status).toBe("cancelled");
    const job = await repo.getJob({ tenantId: tenantA, jobId: created.data.job_id });
    expect(getImportMetrics(job!).cancelled).toBe(1);
  });
});
