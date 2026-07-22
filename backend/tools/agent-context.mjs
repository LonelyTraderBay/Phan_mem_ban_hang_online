#!/usr/bin/env node
/**
 * Print agent context for a backlog task ID.
 * Usage: node tools/agent-context.mjs BE-FND-009
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const BACKLOG = resolve(ROOT, "backend_doc/matrices/implementation_backlog.csv");

const ROUTING = {
  "BE-P0": {
    read: ["docs/p0/P0_CHECKLIST.md", "docs/adr/"],
    verify: ["pnpm verify"],
    slice: null
  },
  "BE-FND-001": {
    read: ["docs/adr/ADR-001-modular-monolith-worker-ai-service.md", "pnpm-workspace.yaml", "eslint.config.mjs"],
    verify: ["pnpm verify"],
    adrs: ["ADR-001"]
  },
  "BE-FND-002": {
    read: ["infra/docker/compose.yaml"],
    verify: ["pnpm verify"]
  },
  "BE-FND-003": {
    read: ["packages/config/src/index.ts", "docs/adr/ADR-010-expand-contract-migration-build-promote.md"],
    verify: ["pnpm verify"],
    adrs: ["ADR-010"]
  },
  "BE-FND-004": {
    read: ["apps/api/src/main.ts", "docs/adr/ADR-003-openapi-first-contracts.md", "backend_doc/matrices/error_catalog.csv"],
    verify: ["pnpm verify"],
    adrs: ["ADR-003"]
  },
  "BE-FND-005": {
    read: ["tools/validate-contracts.mjs", "tools/extract-openapi-operation.mjs"],
    verify: ["pnpm contracts:validate", "pnpm verify"],
    adrs: ["ADR-003"]
  },
  "BE-FND-006": {
    read: ["packages/database/src/index.ts", "docs/adr/ADR-002-postgresql-rls-multitenancy.md"],
    verify: ["pnpm verify"],
    adrs: ["ADR-002"]
  },
  "BE-FND-007": {
    read: ["infra/migrations/", "docs/adr/ADR-010-expand-contract-migration-build-promote.md"],
    verify: ["pnpm verify"],
    adrs: ["ADR-010"]
  },
  "BE-FND-008": {
    read: ["packages/database/src/index.ts", "docs/ai/blueprint-index/06-rls-multitenancy.md"],
    verify: ["pnpm verify"],
    adrs: ["ADR-002"]
  },
  "BE-FND-009": {
    read: ["packages/idempotency/src/index.ts", "backend_doc/matrices/error_catalog.csv"],
    verify: ["pnpm verify"]
  },
  "BE-FND-010": {
    read: ["packages/outbox/src/index.ts", "docs/adr/ADR-004-bullmq-redis-outbox-inbox.md"],
    verify: ["pnpm verify"],
    adrs: ["ADR-004"]
  },
  "BE-FND-011": {
    read: ["apps/worker/src/main.ts", "apps/scheduler/src/main.ts"],
    verify: ["pnpm verify"],
    adrs: ["ADR-004"]
  },
  "BE-FND-012": {
    read: ["modules/audit/README.md", "modules/audit/src/"],
    verify: ["pnpm verify"]
  },
  "BE-FND-013": {
    read: ["packages/observability/src/index.ts", "infra/docker/otel-collector.yaml"],
    verify: ["pnpm verify"]
  },
  "BE-FND-014": {
    read: [".github/workflows/ci.yml"],
    verify: ["pnpm verify:all"]
  },
  "BE-FND-016": {
    read: ["modules/audit/README.md", "docs/tickets/BE-FND-016.md", "infra/migrations/000002_walking_skeleton.sql"],
    verify: ["pnpm verify"],
    adrs: ["ADR-002", "ADR-004"]
  },
  "BE-IDN": {
    read: ["docs/ai/blueprint-index/05-identity-auth.md", "modules/identity/README.md", "modules/tenant/README.md"],
    verify: ["pnpm verify"],
    slice: "Auth"
  },
  "BE-CUS": { read: ["modules/customer/README.md"], verify: ["pnpm verify"], slice: "Customers" },
  "BE-CAT": { read: ["modules/catalog/README.md"], verify: ["pnpm verify"], slice: "Catalog" },
  "BE-INV": { read: ["modules/inventory/README.md"], verify: ["pnpm verify"], slice: "Inventory" },
  "BE-KNW": { read: ["modules/knowledge/README.md"], verify: ["pnpm verify"], slice: "Knowledge" },
  "BE-CHN": { read: ["modules/channel/README.md"], verify: ["pnpm verify"], slice: "Channels" },
  "BE-CON": { read: ["modules/conversation/README.md"], verify: ["pnpm verify"], slice: "Conversations" },
  "BE-ORD": { read: ["modules/order/README.md", "docs/adr/ADR-006-money-minor-units-quantity-decimal.md"], verify: ["pnpm verify"], slice: "Orders", adrs: ["ADR-006"] },
  "BE-PAY": { read: ["modules/payment/README.md"], verify: ["pnpm verify"], slice: "Payments" },
  "BE-AI": {
    read: ["modules/ai-orchestration/README.md", "apps/ai-service/", "docs/adr/ADR-009-ai-zero-trust-tool-mediated.md"],
    verify: ["pnpm verify:all"],
    slice: "AI",
    adrs: ["ADR-009"]
  },
  "BE-DAT": { read: ["modules/analytics/README.md"], verify: ["pnpm verify"], slice: "Analytics" },
  "BE-BIL": { read: ["modules/billing/README.md"], verify: ["pnpm verify"], slice: "Billing" },
  "BE-OPS": { read: ["modules/operations/README.md"], verify: ["pnpm verify"], slice: "Operations" }
};

function parseCsv(text) {
  const lines = text.trim().split("\n");
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const values = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === "," && !inQuotes) {
        values.push(current);
        current = "";
      } else current += ch;
    }
    values.push(current);
    return Object.fromEntries(header.map((h, i) => [h, values[i] ?? ""]));
  });
}

function findRouting(taskId) {
  if (ROUTING[taskId]) return ROUTING[taskId];
  const prefix = Object.keys(ROUTING)
    .filter((k) => k !== taskId && taskId.startsWith(k.replace(/-\d+$/, "").replace(/-$/, "") || k))
    .sort((a, b) => b.length - a.length)
    .find((k) => taskId.startsWith(k.split("-").slice(0, 2).join("-")));
  if (prefix) return ROUTING[prefix];
  for (const key of Object.keys(ROUTING)) {
    if (taskId.startsWith(key)) return ROUTING[key];
  }
  return null;
}

const taskId = process.argv[2];
if (!taskId) {
  console.error("Usage: node tools/agent-context.mjs <TASK_ID>");
  console.error("Example: node tools/agent-context.mjs BE-FND-009");
  process.exit(1);
}

const rows = parseCsv(readFileSync(BACKLOG, "utf8"));
const task = rows.find((r) => r.task_id === taskId);
if (!task) {
  console.error(`Task not found: ${taskId}`);
  process.exit(1);
}

const routing = findRouting(taskId) ?? {
  read: ["docs/ai/CONTEXT_MAP.md"],
  verify: ["pnpm verify"]
};

console.log(`# Agent context: ${taskId}`);
console.log();
console.log(`**Title:** ${task.title}`);
console.log(`**Phase:** ${task.phase}`);
console.log(`**Status:** ${task.status}`);
if (task.primary_paths) console.log(`**Primary paths:** ${task.primary_paths.replace(/;/g, ", ")}`);
console.log();
console.log("## Read set");
console.log("- backend_doc/START_HERE.md");
console.log("- docs/ai/CONTEXT_MAP.md");
for (const f of routing.read ?? []) console.log(`- ${f}`);
console.log();
if (routing.slice) {
  console.log("## Contract slice");
  console.log(`pnpm agent:contract-slice --tag ${routing.slice}`);
  console.log();
}
if (routing.adrs?.length) {
  console.log("## Related ADRs");
  for (const adr of routing.adrs) console.log(`- docs/adr/${adr}*.md`);
  console.log();
}
console.log("## Verify");
for (const cmd of routing.verify ?? ["pnpm verify"]) console.log(`- \`${cmd}\``);
console.log();
console.log("## Rules");
console.log("- .cursor/rules/00-global-invariants.mdc");
console.log("- .cursor/skills/ai-sales-backend/SKILL.md");
