import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve(import.meta.dirname, "../backend_doc/matrices/implementation_backlog.csv");
const original = execSync("git show HEAD:backend_doc/matrices/implementation_backlog.csv", {
  cwd: resolve(import.meta.dirname, ".."),
  encoding: "utf8"
});

function escapeCsv(value) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else current += ch;
  }
  values.push(current);
  return values;
}

const statusMap = {
  "BE-P0-001": ["Done", "docs/p0/capacity-slo-cost-assumptions.md"],
  "BE-P0-002": ["Done", "docs/adr/"],
  "BE-P0-003": ["Done", "docs/diagrams/;docs/threat-model/"],
  "BE-P0-004": ["Done", "docs/data/table-classification-seed.md"],
  "BE-P0-005": ["Done", "backend_doc/matrices/permission_matrix.csv"],
  "BE-P0-006": ["Done", "docs/domain/state-machine-transition-matrices.md"],
  "BE-P0-007": ["Done", "backend_doc/contracts/;packages/contracts-http/"],
  "BE-P0-008": ["Done", "backend_doc/matrices/error_catalog.csv"],
  "BE-P0-009": ["Done", "docs/release/environment-topology.md"],
  "BE-P0-010": ["Done", "docs/threat-model/p0-threat-model.md"],
  "BE-P0-011": ["Done", "docs/p0/epic-dependency-board.md"],
  "BE-FND-001": ["In Progress", "package.json;modules/;eslint.config.mjs"],
  "BE-FND-002": ["Done", "infra/docker/compose.yaml"],
  "BE-FND-003": ["Done", "packages/config/"],
  "BE-FND-004": ["In Progress", "apps/api/"],
  "BE-FND-005": ["In Progress", "tools/validate-contracts.mjs;packages/contracts-http/"],
  "BE-FND-006": ["In Progress", "packages/database/"],
  "BE-FND-007": ["In Progress", "infra/migrations/"],
  "BE-FND-008": ["Not Started", "packages/database/;infra/migrations/"],
  "BE-FND-009": ["Not Started", "packages/idempotency/"],
  "BE-FND-010": ["Not Started", "packages/outbox/"],
  "BE-FND-011": ["Not Started", "apps/worker/;apps/scheduler/"],
  "BE-FND-012": ["In Progress", "modules/audit/"],
  "BE-FND-013": ["In Progress", "packages/observability/;apps/api/"],
  "BE-FND-014": ["In Progress", ".github/workflows/ci.yml"],
  "BE-FND-015": ["Not Started", "infra/;docs/release/"],
  "BE-FND-016": ["In Progress", "modules/audit/;apps/api/;infra/migrations/"]
};

const modulePaths = {
  "BE-IDN": "modules/identity/;modules/tenant/",
  "BE-CUS": "modules/customer/",
  "BE-CAT": "modules/catalog/",
  "BE-IMP": "modules/catalog/",
  "BE-INV": "modules/inventory/",
  "BE-KNW": "modules/knowledge/",
  "BE-CHN": "modules/channel/",
  "BE-CON": "modules/conversation/",
  "BE-ORD": "modules/order/",
  "BE-PAY": "modules/payment/",
  "BE-FUL": "modules/fulfillment/",
  "BE-RET": "modules/fulfillment/",
  "BE-AI": "modules/ai-orchestration/;apps/ai-service/",
  "BE-DAT": "modules/analytics/",
  "BE-BIL": "modules/billing/",
  "BE-OPS": "modules/operations/",
  "BE-DSK": "modules/operations/",
  "BE-HRD": "docs/;infra/;apps/"
};

const lines = original.trim().split("\n");
const out = [["phase", "task_id", "title", "deliverable_or_details", "status", "primary_paths"].join(",")];

for (let i = 1; i < lines.length; i++) {
  const [phase, taskId, title, details, oldStatus] = parseCsvLine(lines[i]);
  let status = oldStatus || "Not Started";
  let paths = "";
  if (statusMap[taskId]) [status, paths] = statusMap[taskId];
  else {
    const prefix = Object.keys(modulePaths).find((p) => taskId.startsWith(p));
    if (prefix) paths = modulePaths[prefix];
  }
  out.push(
    [phase, taskId, title, details, status, paths].map((v) => escapeCsv(v ?? "")).join(",")
  );
}

writeFileSync(path, out.join("\n") + "\n");
console.log("Fixed backlog CSV with", out.length - 1, "rows");
