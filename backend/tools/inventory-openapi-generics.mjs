import { readFileSync, writeFileSync } from "node:fs";
import { parse } from "yaml";

const path = "backend_doc/contracts/openapi.yaml";
const spec = parse(readFileSync(path, "utf8"));
const rows = [];
const genericRe = /Generic(CommandRequest|DataResponse|Resource)/;

function refName(ref) {
  if (!ref) return null;
  const m = String(ref).match(/#\/components\/schemas\/(.+)/);
  return m ? m[1] : String(ref);
}

function schemaNames(node, out = new Set()) {
  if (!node || typeof node !== "object") return out;
  if (node.$ref) out.add(refName(node.$ref));
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) v.forEach((i) => schemaNames(i, out));
    else if (v && typeof v === "object") schemaNames(v, out);
  }
  return out;
}

for (const [p, item] of Object.entries(spec.paths || {})) {
  for (const [method, op] of Object.entries(item)) {
    if (!op || typeof op !== "object" || !op.operationId) continue;
    const names = [...schemaNames(op)];
    const generics = names.filter((n) => genericRe.test(n));
    if (generics.length === 0) continue;
    const tags = (op.tags || ["(none)"]).join("|");
    for (const g of generics) {
      rows.push({
        operation_id: op.operationId,
        path: p,
        method: method.toUpperCase(),
        tag: tags,
        generic_kind: g,
        status: "open",
        notes: "",
      });
    }
  }
}

rows.sort(
  (a, b) =>
    a.tag.localeCompare(b.tag) || a.operation_id.localeCompare(b.operation_id),
);

const header = "operation_id,path,method,tag,generic_kind,status,notes";
const csv = [
  header,
  ...rows.map((r) =>
    [r.operation_id, r.path, r.method, r.tag, r.generic_kind, r.status, r.notes]
      .map((c) => `"${String(c).replaceAll('"', '""')}"`)
      .join(","),
  ),
].join("\n");
writeFileSync("docs/enterprise-freeze/inventory/openapi_generic_debt.csv", `${csv}\n`);

const byTag = {};
for (const r of rows) {
  byTag[r.tag] ??= new Set();
  byTag[r.tag].add(r.operation_id);
}
console.log("operations_with_generic", new Set(rows.map((r) => r.operation_id)).size);
console.log("generic_refs", rows.length);
console.log("by_tag:");
for (const [t, ops] of Object.entries(byTag).sort(
  (a, b) => b[1].size - a[1].size,
)) {
  console.log(`  ${t}\t${ops.size}\t${[...ops].join(", ")}`);
}

const schemas = Object.keys(spec.components?.schemas || {});
const typed = schemas.filter((s) => !genericRe.test(s));
console.log("total_schemas", schemas.length, "non_generic", typed.length);
console.log(
  "identityish",
  typed.filter((s) => /Auth|Session|Mfa|Oidc|Member|Role|Invite|Tenant|Device|Permission/i.test(s)).join(", "),
);
