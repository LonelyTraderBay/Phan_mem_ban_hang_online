# Review package Task 2

BASE: working tree before Task 2 (no separate commit)
HEAD: working tree after Task 2
File changed: frontend/tooling/scripts/sync-backend-contracts.mjs

## Relevant current code (resolveBackendRoot)

```javascript
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
// ...
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

  const sibling = resolve(frontendRoot, "..", "backend");
  if (looksLikeBackend(sibling)) {
    return sibling;
  }

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

    const siblingOfCheckout = resolve(gitRoot, "..", "backend");
    if (looksLikeBackend(siblingOfCheckout)) {
      return siblingOfCheckout;
    }
  } catch {
    // fall through
  }

  return fileURLToPath(new URL("../../../backend", import.meta.url));
}
```

## Test evidence (from implementer report)
- pnpm install in frontend required (node_modules after rename) — exit 0
- pnpm -C frontend contracts:sync — exit 0; 155 tenant + 10 ops paths
