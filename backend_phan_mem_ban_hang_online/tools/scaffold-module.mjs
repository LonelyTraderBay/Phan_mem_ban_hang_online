#!/usr/bin/env node
/**
 * Scaffold a bounded-context module per blueprint §3.2.
 * Usage: node tools/scaffold-module.mjs identity
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
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

const name = process.argv[2];
if (!name || !MODULE_META[name]) {
  console.error("Usage: node tools/scaffold-module.mjs <module-name>");
  console.error("Available:", Object.keys(MODULE_META).join(", "));
  process.exit(1);
}

const meta = MODULE_META[name];
const pkgName = `@ai-sales/module-${name}`;
const moduleDir = resolve(ROOT, "modules", name);

if (existsSync(moduleDir)) {
  console.error(`Module already exists: ${moduleDir}`);
  process.exit(1);
}

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

writeFileSync(
  resolve(moduleDir, "package.json"),
  JSON.stringify(
    {
      name: pkgName,
      version: "0.1.0",
      private: true,
      type: "module",
      main: "src/index.ts",
      dependencies: {
        "@ai-sales/domain-kernel": "workspace:*"
      }
    },
    null,
    2
  ) + "\n"
);

writeFileSync(
  resolve(moduleDir, "src/index.ts"),
  `// Public module API — import only from this entry point across modules.\nexport const MODULE_NAME = "${name}" as const;\n`
);

writeFileSync(
  resolve(moduleDir, "README.md"),
  `# ${kebabToPascal(name)} module

## Purpose

${meta.purpose}

## Owned data

TBD — see blueprint §7 and \`docs/data/data-dictionary.md\` (table class + RLS status; \`table-classification-seed.md\` is the older seed this file superseded).

## OpenAPI tags

${meta.tags}

## Task IDs

${meta.tasks}

## Structure

\`\`\`
src/
├── domain/
├── application/
├── infrastructure/
├── presentation/
└── index.ts   # public exports only
\`\`\`

## Agent read order

1. This README
2. \`docs/ai/CONTEXT_MAP.md\`
3. \`pnpm agent:contract-slice --tag <Tag>\`
4. Relevant blueprint section via \`docs/ai/blueprint-index/\`
`
);

console.log(`Scaffolded ${moduleDir}`);
