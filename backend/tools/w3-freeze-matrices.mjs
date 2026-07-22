/**
 * W3 freeze: extend permission_matrix + error_catalog, rewire OpenAPI x-permission,
 * write GAP-003 alias map, sync package openapi copy.
 */
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { parse, stringify } from "yaml";

const OPENAPI_SRC = "backend_doc/contracts/openapi.yaml";
const OPENAPI_COPY = "packages/contracts-http/openapi.yaml";
const PERM_CSV = "backend_doc/matrices/permission_matrix.csv";
const ERR_CSV = "backend_doc/matrices/error_catalog.csv";

const NEW_PERMS = [
  // GAP-001
  "catalog.import,Confidential,1,1,1,0,0,0,0,Run bulk catalog import jobs (distinct from day-to-day catalog.write),catalog,Danh mục sản phẩm,60",
  "catalog.publish,Restricted,1,1,0,0,0,0,0,Publish/activate catalog entities (distinct from draft catalog.write),catalog,Danh mục sản phẩm,60",
  // GAP-002
  "ops.alert.acknowledge,Restricted,0,0,0,0,0,0,0,Acknowledge/resolve platform system alerts,operations,Vận hành nền tảng,170",
  "ops.ai.disable,Restricted,0,0,0,0,0,0,0,Platform-scoped AI kill switch (distinct from tenant ai.disable),operations,Vận hành nền tảng,170",
  "ops.channel.manage,Restricted,0,0,0,0,0,0,0,Platform-scoped channel force-disconnect / reprocess,operations,Vận hành nền tảng,170",
  // GAP-003 genuine new keys
  "customer.export,Restricted,1,1,0,0,0,0,0,Export customer data (privacy-reviewed),customers,Khách hàng,50",
  "ai.sandbox.test,Restricted,1,1,0,0,0,0,0,Run AI sandbox/test message without production send,ai,AI,110",
  "report.revenue.read,Confidential,1,1,1,1,0,1,0,Read revenue report (subset of report.read),reports,Báo cáo,150",
  "report.sla.read,Confidential,1,1,1,1,0,1,0,Read SLA report,reports,Báo cáo,150",
  "report.ai_quality.read,Restricted,1,1,1,0,0,1,0,Read AI quality report,reports,Báo cáo,150",
  "packing_slip.print,Restricted,1,1,1,0,1,0,0,Generate/print packing slips,shipments,Giao vận,140",
];

/** operationId → new x-permission */
const OP_PERM_UPDATES = {
  createImportJob: "catalog.import",
  analyzeImport: "catalog.import",
  updateImportMapping: "catalog.import",
  confirmImport: "catalog.import",
  cancelImport: "catalog.import",
  // publish knowledge already knowledge.publish; catalog.publish reserved for product activate UX
  getRevenueReport: "report.revenue.read",
  getSlaReport: "report.sla.read",
  getAIQualityReport: "report.ai_quality.read",
  createPackingSlipJob: "packing_slip.print",
  disableTenantAI: "ops.ai.disable",
  createCustomerPrivacyExport: "customer.export",
  testAIMessage: "ai.sandbox.test",
};

const NEW_ERRORS = [
  "ENTITLEMENT_LIMIT_EXCEEDED,403,billing,0,Gói dịch vụ đã đạt hạn mức. Vui lòng nâng cấp hoặc giảm sử dụng.,Hard block when plan meter at/above 100% (HO_DEFAULTS_v1 §3). Prefer this over inventing quota messages.",
  "ENTITLEMENT_WARNING,200,billing,0,Gói dịch vụ sắp đạt hạn mức.,Soft-warn band; may appear as header X-Entitlement-Warning with 200 responses (HO_DEFAULTS_v1).",
  "TAX_RATE_MISMATCH,409,order,0,Thuế trên đơn không khớp cấu hình hiện tại.,Order tax_rate_bps/inclusive flag drifted from HO_DEFAULTS / tenant tax config.",
];

function ensureCsvRows(path, newLines, keyIndex = 0) {
  let text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  if (!text.endsWith("\n")) text += "\n";
  const existing = new Set(
    text
      .trim()
      .split("\n")
      .slice(1)
      .map((l) => l.split(",")[keyIndex]),
  );
  const added = [];
  for (const line of newLines) {
    const key = line.split(",")[keyIndex];
    if (existing.has(key)) continue;
    text += line + "\n";
    existing.add(key);
    added.push(key);
  }
  writeFileSync(path, text);
  return added;
}

function main() {
  const addedPerms = ensureCsvRows(PERM_CSV, NEW_PERMS, 0);
  const addedErrors = ensureCsvRows(ERR_CSV, NEW_ERRORS, 0);

  const spec = parse(readFileSync(OPENAPI_SRC, "utf8"));
  let updatedOps = 0;
  for (const item of Object.values(spec.paths || {})) {
    for (const op of Object.values(item)) {
      if (!op?.operationId) continue;
      const next = OP_PERM_UPDATES[op.operationId];
      if (!next) continue;
      if (op["x-permission"] !== next) {
        op["x-permission"] = next;
        updatedOps += 1;
      }
    }
  }

  // Optional: if acknowledge alert op appears later — none today.
  // Ensure listSystemAlerts stays ops.alert.read.

  const yamlOut = stringify(spec, {
    lineWidth: 0,
    defaultKeyType: "PLAIN",
    defaultStringType: "PLAIN",
  });
  writeFileSync(OPENAPI_SRC, yamlOut);
  copyFileSync(OPENAPI_SRC, OPENAPI_COPY);

  console.log(
    JSON.stringify({ addedPerms, addedErrors, updatedOps }, null, 2),
  );
}

main();
