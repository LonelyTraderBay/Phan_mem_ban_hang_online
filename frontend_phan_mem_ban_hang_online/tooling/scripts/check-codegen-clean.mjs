import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const frontendRoot = fileURLToPath(new URL("../..", import.meta.url));

function run(command, args, cwd = frontendRoot) {
  // shell: true so this works with the pnpm.cmd/.ps1 shims Windows package managers install
  // (execFileSync otherwise looks for a literal "pnpm" executable and fails with ENOENT).
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    shell: true,
  });
}

console.log("Re-running contracts:sync and codegen:api to check for uncommitted drift...");
run("node", ["tooling/scripts/sync-backend-contracts.mjs"]);
run("pnpm", ["--filter", "@ai-sales/api-generated", "run", "codegen"]);

const trackedPaths = [
  "contracts",
  "packages/api-generated/src/generated",
  "packages/api-client/src/generated",
];

const diff = run("git", ["status", "--porcelain", "--", ...trackedPaths]);

if (diff.trim().length > 0) {
  console.error("\ncodegen:check-clean FAILED — regenerating contracts/generated code produced a diff:\n");
  console.error(diff);
  console.error("Run 'pnpm contracts:sync && pnpm codegen:api' locally and commit the result.");
  process.exit(1);
}

console.log("codegen:check-clean passed — no drift between backend contracts and committed generated code.");
