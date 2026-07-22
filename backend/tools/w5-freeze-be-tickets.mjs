#!/usr/bin/env node
/**
 * W5 — Generate missing BE tickets + backlog_coverage.csv
 *
 * - Open rows (Not Started / In Progress): require docs/tickets/<id>.md
 * - Done rows: listed in coverage; ticket optional (existing kept)
 * - New tickets: status `doc-frozen` (never invent domain implementation)
 * - Does NOT overwrite existing ticket files
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backlogPath = path.join(
  root,
  "backend_doc/matrices/implementation_backlog.csv",
);
const ticketsDir = path.join(root, "docs/tickets");
const coveragePath = path.join(
  root,
  "docs/enterprise-freeze/inventory/backlog_coverage.csv",
);

const MONEY_RE =
  /order|payment|refund|billing|plan|entitlement|tax|price|money|invoice|subscription|usage.?meter|profit|revenue|cod|shipment|fulfill/i;

/** Undo common UTF-8→Latin-1 mojibake (e.g. XÃ¡c → Xác). */
function fixMojibake(s) {
  if (!s || !/[ÃÂÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâã]/.test(s)) return s;
  try {
    const fixed = Buffer.from(s, "latin1").toString("utf8");
    if (fixed.includes("\uFFFD")) return s;
    return fixed;
  } catch {
    return s;
  }
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length < 5 || !cols[1]) continue;
    rows.push({
      phase: fixMojibake(cols[0]?.trim() ?? ""),
      task_id: cols[1].trim(),
      title: fixMojibake(cols[2]?.trim() ?? ""),
      details: fixMojibake(cols[3]?.trim() ?? ""),
      status: cols[4]?.trim() ?? "",
      primary_paths: cols[5]?.trim() ?? "",
    });
  }
  return rows;
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        q = !q;
      }
      continue;
    }
    if (c === "," && !q) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function phaseShort(phase) {
  const m = phase.match(/\bP(\d+)\b/i);
  return m ? `P${m[1]}` : phase.replace(/^19\.\d+\s+Phase\s+/i, "") || "Px";
}

function domainFromId(taskId) {
  const m = taskId.match(/^BE-([A-Z]+)-/);
  return m ? m[1] : "GEN";
}

function riskFor(taskId, title, details) {
  if (/IDN|PAY|ORD|FND-008|RLS|security|auth/i.test(`${taskId} ${title}`))
    return "critical";
  if (/AI|CHN|INV|BIL|FND/i.test(taskId)) return "high";
  if (/P0|OPS|REP/i.test(taskId)) return "medium";
  return /migration|schema|permission/i.test(`${title} ${details}`)
    ? "high"
    : "medium";
}

function needsHoDefaults(taskId, title, details) {
  return MONEY_RE.test(`${taskId} ${title} ${details}`);
}

function ticketBody(row) {
  const phase = phaseShort(row.phase);
  const domain = domainFromId(row.task_id);
  const risk = riskFor(row.task_id, row.title, row.details);
  const ho = needsHoDefaults(row.task_id, row.title, row.details);
  const paths = row.primary_paths || "(see backlog primary_paths)";
  const openStatus = row.status === "Done" ? "done" : "doc-frozen";

  // Existing Done tickets that somehow missing: still create as done stub
  const status = openStatus;

  const hoBlock = ho
    ? `
Money/tax/billing MUST follow \`docs/business/HO_DEFAULTS_v1.md\` (VAT 10% tax-inclusive;
plans Free/Pro/Business; over-limit soft_warn → hard_block, no auto-upgrade). Do not invent rates.`
    : `
Money N/A for this ticket unless a later scope change adds priced entities — then cite HO_DEFAULTS_v1.`;

  return `---
ticket_id: ${row.task_id}
title: ${escapeYaml(row.title)}
owner: Backend AI Agent
phase: ${phase}
risk: ${risk}
status: ${status}
---

# Business outcome

${row.title}.

Deliverable / details from backlog: ${row.details || "(none — expand from blueprint + contracts before coding)"}.

Primary paths: \`${paths}\`.

# Actor and use case

Actors and flows for domain **${domain}** as defined in the enterprise blueprint and frozen OpenAPI/AsyncAPI contracts for this phase (${phase}).

# In scope / Out of scope

In scope:
- ${row.title}
- Align with frozen contracts, permission/error matrices, and data-dictionary classes (W1–W4).
- Tests required by acceptance criteria below.

Out of scope:
- Unrelated modules
- FE UI (FE consumes contracts after sync)
- Inventing permissions, money rules, or schema classes not in freeze docs

# Dependencies

- Enterprise freeze gate: feature coding forbidden until \`FULL_PRODUCT_DOC_FREEZE.md\` = PASS (except freeze-wave doc work).
- Prefer prior phase tickets Done; consult \`docs/p0/epic-dependency-board.md\`.
- Cite related \`docs/tickets/BE-*.md\` siblings in the same domain when implementing.
${hoBlock}

# Domain invariants and state transitions

- Never trust client \`tenant_id\` for authorization; set tenant context server-side.
- Apply state machines from \`docs/domain/state-machine-transition-matrices.md\` where this ticket owns transitions.
- Ledger / append-only tables: no hard DELETE; compensating rows only.
- Follow \`docs/data/data-dictionary.md\` + \`rls-intent-catalog.md\` for any table this ticket creates/touches.

# Contract

- OpenAPI operation/schema: slice with \`pnpm agent:contract-slice\` for ${domain}; implement only operations this ticket owns.
- AsyncAPI events: emit/consume only events listed for this deliverable in \`backend_doc/contracts/asyncapi.yaml\`.
- Error codes: \`backend_doc/matrices/error_catalog.csv\` only — no ad-hoc codes.
- Realtime event: only if AsyncAPI / ops channel lists one for this work.

# Authorization and data classification

- Required permission: every public operation must have \`x-permission\` resolving to \`permission_matrix.csv\`.
- Tenant/RLS behavior: per table class in data-dictionary; FORCE RLS for tenant-scoped tables.
- Field-level restrictions: blueprint §5.5 / cost fields where applicable.
- Data classification: secrets hashed/encrypted; PII redacted in logs/audit.

# Persistence and migration

- Tables/columns/constraints/indexes/RLS: only those required by this deliverable; class must already be frozen (no \`Needs confirmation\`).
- Backfill: document if any; default none for greenfield.
- Rolling-deploy compatibility: expand/contract only.

# Transaction, concurrency and idempotency

- Transaction boundary: business mutation + outbox/audit/idempotency in one tenant transaction where required.
- Lock order/isolation: follow module invariants; avoid cross-aggregate deadlocks.
- Idempotency scope/TTL: required on critical mutators per OpenAPI \`x-idempotency\` / blueprint §8.7.
- Retry behavior: fail-closed on non-retryable; DLQ for workers.

# Audit, telemetry and operations

- Audit action: record security/business-significant mutations via audit port.
- Logs/traces/metrics: correlation IDs; no secrets in clear text.
- Alert/runbook impact: note new alerts if this ticket adds SLO-sensitive paths.
- Feature flag/rollout: prefer flag when changing tenant-visible behavior.
- Rollback: disable route/flag; no destructive down-migrations of ledger data.

# Acceptance criteria

- [ ] Happy path matches contract + backlog deliverable
- [ ] Validation / business conflict codes from error catalog
- [ ] Permission + tenant isolation tests (deny cross-tenant)
- [ ] Idempotency / retry where mutator is critical
- [ ] Transaction rollback / concurrency when applicable
- [ ] Audit / outbox / domain events as required
- [ ] Contract / generated client note for FE sync
- [ ] Staging smoke checklist item when phase reaches staging
${ho ? "- [ ] Money/tax/billing assertions match HO_DEFAULTS_v1\n" : ""}
# Test cases

Derive from BE domain test matrices / blueprint §13 where present; otherwise write permission-negative + happy-path + isolation cases before coding.

# Completion manifest

- Contracts changed:
- Migration:
- Tests/evidence:
- Known risks:

# Freeze provenance

- Generated/updated: 2026-07-22 (enterprise freeze W5)
- Backlog status at freeze: ${row.status}
- Source: \`backend_doc/matrices/implementation_backlog.csv\`
`;
}

function escapeYaml(s) {
  return String(s).replace(/\r?\n/g, " ").trim();
}

function existingTicketStatus(filePath) {
  try {
    const head = fs.readFileSync(filePath, "utf8").slice(0, 400);
    const m = head.match(/^status:\s*(\S+)/m);
    return m ? m[1] : "present";
  } catch {
    return null;
  }
}

function isW5Generated(abs) {
  if (!fs.existsSync(abs)) return false;
  const t = fs.readFileSync(abs, "utf8");
  return t.includes("enterprise freeze W5");
}

function main() {
  const forceRegen = process.argv.includes("--force-generated");
  const fixBacklog = process.argv.includes("--fix-backlog-encoding");
  const raw = fs.readFileSync(backlogPath);
  const text = raw.toString("utf8");

  const rows = parseCsv(text);
  if (rows.length === 0) {
    console.error("No backlog rows parsed");
    process.exit(1);
  }

  if (fixBacklog) {
    const header =
      "phase,task_id,title,deliverable_or_details,status,primary_paths";
    const lines = rows.map((r) =>
      [
        csvEscape(r.phase),
        r.task_id,
        csvEscape(r.title),
        csvEscape(r.details),
        r.status,
        csvEscape(r.primary_paths),
      ].join(","),
    );
    fs.writeFileSync(backlogPath, `${header}\n${lines.join("\n")}\n`, "utf8");
    console.log("Fixed backlog encoding:", backlogPath);
  }

  fs.mkdirSync(ticketsDir, { recursive: true });

  let created = 0;
  let regenerated = 0;
  let skippedExisting = 0;
  const coverage = [];

  for (const row of rows) {
    const rel = `docs/tickets/${row.task_id}.md`;
    const abs = path.join(root, rel);
    const exists = fs.existsSync(abs);
    const isOpen = row.status === "Not Started" || row.status === "In Progress";
    const shouldWrite =
      !exists ||
      (forceRegen && isW5Generated(abs));

    if (shouldWrite) {
      fs.writeFileSync(abs, ticketBody(row), "utf8");
      if (exists) regenerated++;
      else created++;
    } else if (exists) {
      skippedExisting++;
    }

    const freezeStatus = exists || fs.existsSync(abs)
      ? existingTicketStatus(abs) || "present"
      : "MISSING";

    coverage.push({
      task_id: row.task_id,
      phase: phaseShort(row.phase),
      backlog_status: row.status,
      ticket_path: fs.existsSync(abs) ? rel.replace(/\\/g, "/") : "",
      freeze_status: fs.existsSync(abs)
        ? existingTicketStatus(abs) || "present"
        : isOpen
          ? "MISSING"
          : "done_no_ticket",
      notes: needsHoDefaults(row.task_id, row.title, row.details)
        ? "cites_HO_DEFAULTS"
        : "",
    });
  }

  // Recompute freeze_status after writes
  for (const c of coverage) {
    if (!c.ticket_path) continue;
    const st = existingTicketStatus(path.join(root, c.ticket_path));
    c.freeze_status = st || "present";
  }

  const header =
    "task_id,phase,backlog_status,ticket_path,freeze_status,notes";
  const body = coverage
    .map((c) =>
      [
        c.task_id,
        c.phase,
        csvEscape(c.backlog_status),
        c.ticket_path,
        c.freeze_status,
        c.notes,
      ].join(","),
    )
    .join("\n");
  fs.writeFileSync(coveragePath, `${header}\n${body}\n`, "utf8");

  const open = coverage.filter(
    (c) =>
      c.backlog_status === "Not Started" || c.backlog_status === "In Progress",
  );
  const openMissing = open.filter((c) => !c.ticket_path || c.freeze_status === "MISSING");
  const byStatus = {};
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1;

  console.log(
    JSON.stringify(
      {
        backlog_rows: rows.length,
        by_status: byStatus,
        tickets_created: created,
        tickets_regenerated: regenerated,
        tickets_kept: skippedExisting,
        open_rows: open.length,
        open_missing_tickets: openMissing.length,
        coverage_path: coveragePath,
      },
      null,
      2,
    ),
  );

  if (openMissing.length) {
    console.error(
      "MISSING:",
      openMissing.map((c) => c.task_id).join(", "),
    );
    process.exit(1);
  }
}

function csvEscape(s) {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

main();
