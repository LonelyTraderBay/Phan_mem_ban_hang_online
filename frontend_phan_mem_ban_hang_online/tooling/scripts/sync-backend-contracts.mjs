import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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

// `backend/` is a sibling of the real frontend checkout, not of wherever this script's file
// happens to sit — a fixed "../../../backend" relative to the script breaks when it's run from a
// git worktree (Claude Code commonly runs from frontend/.claude/worktrees/<name>/, which nests
// several extra directories deeper than a normal clone). `git rev-parse --git-common-dir` always
// resolves to the real repo's .git directory, even from inside a worktree, so derive backendRoot
// from that instead. Falls back to the old relative path if git isn't available for some reason.
//
// CI (.github/workflows/pr.yml) checks out LonelyTraderBay/backend into its own subdirectory
// rather than as a true sibling directory (gitleaks-action needs $GITHUB_WORKSPACE itself to stay
// a git repo, so the two repos can't share a nesting the way a local dev machine's
// frontend/ + backend/ sibling layout does) — BACKEND_CONTRACTS_ROOT lets that CI job point here
// explicitly instead of relying on relative-path guessing.
function resolveBackendRoot() {
  if (process.env.BACKEND_CONTRACTS_ROOT) {
    return process.env.BACKEND_CONTRACTS_ROOT;
  }
  try {
    const gitCommonDir = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd: fileURLToPath(new URL(".", import.meta.url)), encoding: "utf8" },
    ).trim();
    const mainFrontendRoot = dirname(gitCommonDir); // .git's parent is the real frontend/ checkout
    return resolve(mainFrontendRoot, "..", "backend");
  } catch {
    return fileURLToPath(new URL("../../../backend", import.meta.url));
  }
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
  const source = readFileSync(sourcePath, "utf8");
  mkdirSync(`${frontendRoot}/contracts/asyncapi`, { recursive: true });
  writeFileSync(`${frontendRoot}/contracts/asyncapi/tenant-events.yaml`, GENERATED_BANNER + source, "utf8");
  console.log(`wrote ${frontendRoot}/contracts/asyncapi/tenant-events.yaml`);

  // No ops-scoped async events exist in the backend contract yet (verified at scaffold time) —
  // this stub documents intent rather than pretending a split happened.
  const stub = {
    asyncapi: "3.1.0",
    info: {
      title: "Ops Events (STUB)",
      version: "0.0.0",
      description:
        "No Super Admin/Operations-specific async events exist in the backend contract yet. " +
        "This file is a placeholder so packages/realtime and codegen tooling have a stable " +
        "two-file shape matching contracts/openapi's tenant/ops split. Populate when backend " +
        "ships ops-scoped events.",
    },
    channels: {},
    operations: {},
  };
  writeYaml(`${frontendRoot}/contracts/asyncapi/ops-events.yaml`, GENERATED_BANNER, stub);
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
