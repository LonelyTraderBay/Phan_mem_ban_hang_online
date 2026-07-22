import { readFileSync } from "node:fs";
import { parse } from "yaml";

const spec = parse(readFileSync("backend_doc/contracts/openapi.yaml", "utf8"));

function bodyRef(op) {
  const schema = op?.requestBody?.content?.["application/json"]?.schema;
  return schema?.$ref || schema || null;
}
function okRef(op) {
  for (const code of ["200", "201", "202"]) {
    const r = op?.responses?.[code];
    const ref = r?.content?.["application/json"]?.schema?.$ref;
    if (ref) return `${code}:${ref}`;
  }
  return null;
}

const checks = [
  ["/products", "post"],
  ["/orders", "post"],
  ["/orders/{order_id}/confirm", "post"],
  ["/customers", "post"],
  ["/members/invitations", "post"],
  ["/tenants/current", "patch"],
  ["/billing/subscription", "post"],
];

for (const [p, m] of checks) {
  const op = spec.paths[p]?.[m];
  console.log(
    op?.operationId,
    "body=",
    bodyRef(op),
    "res=",
    okRef(op),
  );
}

// find receiveWebhook path
for (const [p, item] of Object.entries(spec.paths)) {
  for (const [m, op] of Object.entries(item)) {
    if (op?.operationId === "receiveWebhook") {
      console.log("receiveWebhook", p, m, "body=", bodyRef(op), "res=", okRef(op));
    }
  }
}

console.log(
  "OrderResource.tax_rate_bps",
  spec.components.schemas.OrderResource.properties.tax_rate_bps,
);
console.log(
  "lines",
  readFileSync("backend_doc/contracts/openapi.yaml", "utf8").split(/\n/).length,
);
