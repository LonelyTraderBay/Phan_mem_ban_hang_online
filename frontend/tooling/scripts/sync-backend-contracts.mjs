import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import YAML from "yaml";

/**
 * Syncs frontend/contracts/ from the backend's real contracts (spec 21 F00 entry criteria,
 * FE-F00-004). Idempotent — safe to re-run; CI (CP10) re-runs and diffs to catch drift.
 *
 * Tenant/ops OpenAPI split: mechanical, by path prefix `/super-admin/` (verified 1:1 with the
 * `Operations` tag — see frontend_doc spec section 21/28 discussion). Splitting (not stubbing
 * ops-api.yaml, not duplicating the whole file into both) avoids silently blocking
 * apps/super-admin from ever getting a real typed client, and avoids leaking tenant-only
 * operations into the Super Admin app's type space (defeats ADR-FE-004's blast-radius goal).
 */

const frontendRoot = fileURLToPath(new URL("../..", import.meta.url));
const backendRoot = resolveBackendRoot();

// Prefer <frontend>/../backend (umbrella monorepo). BACKEND_CONTRACTS_ROOT overrides
// for CI. Git-common-dir heuristics cover worktrees and legacy two-repo checkouts.
function resolveBackendRoot() {
  if (process.env.BACKEND_CONTRACTS_ROOT) {
    return process.env.BACKEND_CONTRACTS_ROOT;
  }

  const looksLikeBackend = (candidate) =>
    existsSync(resolve(candidate, "packages/contracts-http/openapi.yaml"));

  // Umbrella (and normal sibling checkout): frontend/../backend
  const sibling = resolve(frontendRoot, "..", "backend");
  if (looksLikeBackend(sibling)) {
    return sibling;
  }

  // Worktree / alternate layouts: walk from git common dir
  try {
    const gitCommonDir = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd: fileURLToPath(new URL(".", import.meta.url)), encoding: "utf8" },
    ).trim();
    const gitRoot = dirname(gitCommonDir);

    const underGitRoot = resolve(gitRoot, "backend");
    if (looksLikeBackend(underGitRoot)) {
      return underGitRoot;
    }

    // Legacy two-repo: git root is frontend/, sibling is ../backend
    const siblingOfCheckout = resolve(gitRoot, "..", "backend");
    if (looksLikeBackend(siblingOfCheckout)) {
      return siblingOfCheckout;
    }
  } catch {
    // fall through
  }

  return fileURLToPath(new URL("../../../backend", import.meta.url));
}

const GENERATED_BANNER =
  "# GENERATED — do not hand-edit. Source: backend openapi.yaml (split by path prefix).\n" +
  "# Run 'pnpm contracts:sync' to refresh.\n";

function readYaml(path) {
  return YAML.parse(readFileSync(path, "utf8"));
}

function writeYaml(path, banner, doc) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, banner + YAML.stringify(doc), "utf8");
  console.log(`wrote ${path}`);
}

function splitOpenApi() {
  const source = readYaml(`${backendRoot}/packages/contracts-http/openapi.yaml`);
  const tenantPaths = {};
  const opsPaths = {};

  for (const [path, pathItem] of Object.entries(source.paths ?? {})) {
    const isOps = path.startsWith("/super-admin/");
    if (isOps) opsPaths[path] = pathItem;
    else tenantPaths[path] = pathItem;
  }

  const base = { ...source };
  delete base.paths;

  writeYaml(`${frontendRoot}/contracts/openapi/tenant-api.yaml`, GENERATED_BANNER, {
    ...base,
    info: { ...source.info, title: `${source.info?.title ?? "API"} (Tenant)` },
    paths: tenantPaths,
  });

  writeYaml(`${frontendRoot}/contracts/openapi/ops-api.yaml`, GENERATED_BANNER, {
    ...base,
    info: { ...source.info, title: `${source.info?.title ?? "API"} (Operations)` },
    paths: opsPaths,
  });

  console.log(
    `openapi split: ${Object.keys(tenantPaths).length} tenant paths, ${Object.keys(opsPaths).length} ops paths`,
  );
}

function syncAsyncApi() {
  const sourcePath = `${backendRoot}/backend_doc/contracts/asyncapi.yaml`;
  const sourceDoc = readYaml(sourcePath);
  mkdirSync(`${frontendRoot}/contracts/asyncapi`, { recursive: true });

  // Tenant file: full backend AsyncAPI minus ops channel (domain + realtime remain).
  const tenantDoc = structuredClone(sourceDoc);
  if (tenantDoc.channels?.opsEvents) delete tenantDoc.channels.opsEvents;
  if (tenantDoc.operations?.publishOpsEvents) delete tenantDoc.operations.publishOpsEvents;
  if (tenantDoc.operations?.consumeOpsEvents) delete tenantDoc.operations.consumeOpsEvents;
  writeYaml(
    `${frontendRoot}/contracts/asyncapi/tenant-events.yaml`,
    GENERATED_BANNER,
    tenantDoc,
  );
  console.log(`wrote ${frontendRoot}/contracts/asyncapi/tenant-events.yaml`);

  // Ops file: opsEvents channel + referenced components only (stable two-file shape).
  const opsChannel = sourceDoc.channels?.opsEvents;
  if (!opsChannel || !opsChannel.messages || Object.keys(opsChannel.messages).length === 0) {
    throw new Error(
      "backend asyncapi.yaml missing populated channels.opsEvents — W2 freeze required",
    );
  }

  const opsMessageNames = Object.keys(opsChannel.messages);
  const opsMessages = {};
  const opsSchemas = {
    Actor: sourceDoc.components?.schemas?.Actor,
    EventEnvelopeBase: sourceDoc.components?.schemas?.EventEnvelopeBase,
  };
  for (const name of opsMessageNames) {
    const msg = sourceDoc.components?.messages?.[name];
    if (!msg) throw new Error(`Missing components.messages.${name} for ops event`);
    opsMessages[name] = msg;
    const payloadRef = msg.payload?.$ref;
    if (typeof payloadRef === "string") {
      const schemaName = payloadRef.split("/").pop();
      opsSchemas[schemaName] = sourceDoc.components.schemas[schemaName];
      const eventSchema = sourceDoc.components.schemas[schemaName];
      // Pull nested *Data schema refs from allOf
      const allOf = eventSchema?.allOf || [];
      for (const part of allOf) {
        const dataRef = part?.properties?.data?.$ref;
        if (typeof dataRef === "string") {
          const dataName = dataRef.split("/").pop();
          opsSchemas[dataName] = sourceDoc.components.schemas[dataName];
        }
      }
    }
  }

  const opsDoc = {
    asyncapi: sourceDoc.asyncapi || "3.1.0",
    info: {
      title: "AI Sales Operating System — Ops Events",
      version: sourceDoc.info?.version || "2.0.0",
      description:
        "Operations / Super Admin scoped events (enterprise doc-freeze W2). Generated from backend asyncapi.yaml channels.opsEvents.",
    },
    servers: sourceDoc.servers,
    channels: {
      opsEvents: {
        address: opsChannel.address || "ops.events",
        description: opsChannel.description,
        messages: Object.fromEntries(
          opsMessageNames.map((n) => [n, { $ref: `#/components/messages/${n}` }]),
        ),
      },
    },
    operations: {
      publishOpsEvents: {
        action: "send",
        channel: { $ref: "#/channels/opsEvents" },
        messages: opsMessageNames.map((n) => ({
          $ref: `#/channels/opsEvents/messages/${n}`,
        })),
      },
      consumeOpsEvents: {
        action: "receive",
        channel: { $ref: "#/channels/opsEvents" },
        messages: opsMessageNames.map((n) => ({
          $ref: `#/channels/opsEvents/messages/${n}`,
        })),
      },
    },
    components: {
      schemas: Object.fromEntries(
        Object.entries(opsSchemas).filter(([, v]) => v != null),
      ),
      messages: opsMessages,
    },
  };

  writeYaml(`${frontendRoot}/contracts/asyncapi/ops-events.yaml`, GENERATED_BANNER, opsDoc);
  console.log(
    `wrote ${frontendRoot}/contracts/asyncapi/ops-events.yaml (${opsMessageNames.length} messages)`,
  );
}

function parseCsvSimple(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    header.forEach((key, index) => {
      row[key] = cells[index] ?? "";
    });
    return row;
  });
}

// Minimal CSV splitter: handles quoted fields containing commas, sufficient for the backend's
// permission_matrix.csv / error_catalog.csv (no embedded newlines inside quoted fields).
function splitCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function syncPermissionMatrix() {
  const rows = parseCsvSimple(readFileSync(`${backendRoot}/backend_doc/matrices/permission_matrix.csv`, "utf8"));
  const roleColumns = ["admin", "manager", "sales", "warehouse", "analyst", "support_default"];
  const permissions = rows.map((row) => ({
    permission: row.permission,
    data_classification: row.data_classification,
    owner: row.owner,
    group: {
      id: row.group_id,
      label_vi: row.group_label_vi,
      display_order: Number(row.display_order),
    },
    roles: Object.fromEntries(roleColumns.map((role) => [role, row[role] === "true" || row[role] === "TRUE" || row[role] === "1"])),
    notes: row.notes ?? "",
  }));
  writeYaml(`${frontendRoot}/contracts/permissions/permission-matrix.yaml`, GENERATED_BANNER, { permissions });

  // Typed PermissionKey union for packages/permissions, so a permission string used in UI is
  // compile-checked against the real matrix (spec 10.6 "permission matrix artefact").
  const keyUnion = permissions.map((p) => `  | "${p.permission}"`).join("\n");
  const tsBanner =
    "// GENERATED — do not hand-edit. Source: backend permission_matrix.csv (via contracts:sync).\n\n";
  const ts = `${tsBanner}export type PermissionKey =\n${keyUnion};\n`;
  mkdirSync(`${frontendRoot}/packages/permissions/src/generated`, { recursive: true });
  writeFileSync(`${frontendRoot}/packages/permissions/src/generated/permissionKeys.ts`, ts, "utf8");
  console.log(`wrote ${frontendRoot}/packages/permissions/src/generated/permissionKeys.ts`);
}

function syncErrorCatalog() {
  const rows = parseCsvSimple(readFileSync(`${backendRoot}/backend_doc/matrices/error_catalog.csv`, "utf8"));
  const errors = rows.map((row) => ({
    code: row.code,
    http_status: Number(row.http_status),
    category: row.category,
    retryable: row.retryable === "true" || row.retryable === "TRUE" || row.retryable === "1",
    user_message_vi: row.user_message_vi,
    description: row.description,
  }));
  writeYaml(`${frontendRoot}/contracts/errors/error-catalog.yaml`, GENERATED_BANNER, { errors });

  // Also emit a typed ErrorCode union for packages/api-client, so `ProblemDetails.code` is
  // checked against the real catalog instead of being a free string.
  const codeUnion = errors.map((e) => `  | "${e.code}"`).join("\n");
  const tsBanner =
    "// GENERATED — do not hand-edit. Source: backend error_catalog.csv (via contracts:sync).\n\n";
  const ts = `${tsBanner}export type ErrorCode =\n${codeUnion};\n`;
  mkdirSync(`${frontendRoot}/packages/api-client/src/generated`, { recursive: true });
  writeFileSync(`${frontendRoot}/packages/api-client/src/generated/errorCodes.ts`, ts, "utf8");
  console.log(`wrote ${frontendRoot}/packages/api-client/src/generated/errorCodes.ts`);
}

function writeBackendRefLock() {
  // Pins CI's backend checkout (see .github/workflows/pr.yml) to the exact commit this sync ran
  // against, instead of always tracking backend's `main` HEAD — without this, a backend contract
  // change breaks CI on unrelated frontend PRs with no causal link to what changed. Deliberately
  // committed (not gitignored): the lock only moves when someone deliberately re-runs
  // contracts:sync, the same way package-lock.json only moves on a deliberate install.
  try {
    const sha = execFileSync("git", ["-C", backendRoot, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
    writeFileSync(`${frontendRoot}/contracts/BACKEND_REF.lock`, `${sha}\n`, "utf8");
    console.log(`wrote contracts/BACKEND_REF.lock (${sha})`);
  } catch (err) {
    console.warn(`could not record backend ref (backendRoot may not be a git repo): ${err.message}`);
  }
}

splitOpenApi();
syncAsyncApi();
syncPermissionMatrix();
syncErrorCatalog();
writeBackendRefLock();
console.log("contracts:sync complete");
