import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Minimal bundle budget check (spec 17.4, PR pipeline step 13). Sums each web app's `dist/`
 * output and fails if it exceeds a fixed byte budget. This is a starting gate, not the full
 * spec 17 performance test suite (real-device/network-throttled testing) — that needs a
 * dedicated tool decision (e.g. size-limit, Lighthouse CI), tracked separately.
 */

const frontendRoot = fileURLToPath(new URL("../..", import.meta.url));

// Uncompressed dist/ budget per app, bytes. Provisional — see spec 17.1 (performance targets
// need Product/Performance sign-off); revisit once real business-feature bundles exist.
const BUDGETS = {
  "apps/web-admin/dist": 2 * 1024 * 1024,
  "apps/super-admin/dist": 2 * 1024 * 1024,
  "apps/windows-client/dist": 2 * 1024 * 1024,
};

function dirSize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(fullPath) : statSync(fullPath).size;
  }
  return total;
}

let failed = false;

for (const [relativeDir, budgetBytes] of Object.entries(BUDGETS)) {
  const dir = join(frontendRoot, relativeDir);
  let size;
  try {
    size = dirSize(dir);
  } catch {
    console.log(`skip: ${relativeDir} not built yet`);
    continue;
  }
  const sizeMb = (size / 1024 / 1024).toFixed(2);
  const budgetMb = (budgetBytes / 1024 / 1024).toFixed(2);
  if (size > budgetBytes) {
    console.error(`✗ ${relativeDir}: ${sizeMb}MB exceeds budget ${budgetMb}MB`);
    failed = true;
  } else {
    console.log(`✓ ${relativeDir}: ${sizeMb}MB (budget ${budgetMb}MB)`);
  }
}

if (failed) {
  console.error("\nbundle budget FAILED");
  process.exit(1);
}
console.log("\nbundle budget passed");
