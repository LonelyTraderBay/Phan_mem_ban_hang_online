import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

const MODULE_META = {
  identity: { purpose: "Authentication, sessions, credentials, MFA.", tags: "Auth, Sessions", tasks: "BE-IDN-*" },
  tenant: { purpose: "Tenant provisioning, settings, membership.", tags: "Tenant, Members, Roles", tasks: "BE-IDN-*" },
  customer: { purpose: "Customer CDP, identities, addresses, consent.", tags: "Customers", tasks: "BE-CUS-*" },
  catalog: { purpose: "Categories, products, variants, imports.", tags: "Catalog, Imports", tasks: "BE-CAT-*, BE-IMP-*" },
  inventory: { purpose: "Warehouses, balances, reservations, movements.", tags: "Inventory", tasks: "BE-INV-*" },
  knowledge: { purpose: "Knowledge sources, chunks, retrieval.", tags: "Knowledge", tasks: "BE-KNW-*" },
  channel: { purpose: "Channel accounts, webhooks, outbound messages.", tags: "Channels, Webhooks", tasks: "BE-CHN-*" },
  conversation: { purpose: "Conversations, messages, assignment, SLA.", tags: "Conversations, Realtime", tasks: "BE-CON-*" },
  "ai-orchestration": { purpose: "AI suggestions, tools, policy gateway.", tags: "AI", tasks: "BE-AI-*" },
  order: { purpose: "Orders, quotes, confirmations, cancellations.", tags: "Orders", tasks: "BE-ORD-*" },
  payment: { purpose: "Payments, refunds, reconciliation.", tags: "Payments", tasks: "BE-PAY-*" },
  fulfillment: { purpose: "Shipments, returns, tracking.", tags: "Shipments, Returns", tasks: "BE-FUL-*, BE-RET-*" },
  analytics: { purpose: "Facts, dashboards, exports.", tags: "Analytics", tasks: "BE-DAT-*" },
  billing: { purpose: "Plans, subscriptions, entitlements, usage.", tags: "Billing", tasks: "BE-BIL-*" },
  audit: { purpose: "Append-only audit log, walking skeleton golden path.", tags: "Audit", tasks: "BE-FND-012, BE-FND-016, BE-IDN-013" },
  operations: { purpose: "Feature flags, health aggregation, support access.", tags: "Operations", tasks: "BE-OPS-*" }
};

function kebabToPascal(name) {
  return name.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}

for (const [name, meta] of Object.entries(MODULE_META)) {
  const moduleDir = resolve(ROOT, "modules", name);
  const dirs = [
    "src/domain",
    "src/application/commands",
    "src/application/queries",
    "src/application/ports",
    "src/application/policies",
    "src/infrastructure/repositories",
    "src/infrastructure/persistence",
    "src/presentation/http"
  ];
  for (const d of dirs) mkdirSync(resolve(moduleDir, d), { recursive: true });

  const pkgPath = resolve(moduleDir, "package.json");
  if (!existsSync(pkgPath)) {
    writeFileSync(
      pkgPath,
      JSON.stringify(
        {
          name: `@ai-sales/module-${name}`,
          version: "0.1.0",
          private: true,
          type: "module",
          main: "src/index.ts",
          dependencies: { "@ai-sales/domain-kernel": "workspace:*" }
        },
        null,
        2
      ) + "\n"
    );
  }

  const indexPath = resolve(moduleDir, "src/index.ts");
  if (!existsSync(indexPath)) {
    writeFileSync(indexPath, `export const MODULE_NAME = "${name}" as const;\n`);
  }

  const readmePath = resolve(moduleDir, "README.md");
  if (!existsSync(readmePath)) {
    writeFileSync(
      readmePath,
      `# ${kebabToPascal(name)} module

## Purpose

${meta.purpose}

## Owned data

TBD — see blueprint §7 and \`docs/data/table-classification-seed.md\`.

## OpenAPI tags

${meta.tags}

## Task IDs

${meta.tasks}

## Agent read order

1. This README
2. \`docs/ai/CONTEXT_MAP.md\`
3. \`pnpm agent:contract-slice --tag <Tag>\`
4. Relevant blueprint section via \`docs/ai/blueprint-index/\`
`
    );
  }
  console.log("Ensured module:", name);
}
