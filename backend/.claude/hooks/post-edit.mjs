import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { extname } from "node:path";

const LINTABLE_EXTENSIONS = new Set([".ts", ".mjs"]);
const CONTRACT_FILE = /(^|\/)(openapi|asyncapi)[^/]*\.(ya?ml|json)$/i;

function readHookInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

function run(cmd, args, cwd) {
  const bin = process.platform === "win32" ? `${cmd}.cmd` : cmd;
  return spawnSync(bin, args, { cwd, encoding: "utf8", windowsHide: true });
}

function main() {
  const input = readHookInput();
  const filePath = input.tool_input?.file_path;
  if (!filePath) return;

  const cwd = input.cwd || process.cwd();
  const normalized = filePath.replace(/\\/g, "/");

  if (LINTABLE_EXTENSIONS.has(extname(normalized))) {
    run("pnpm", ["exec", "prettier", "--write", filePath], cwd);
    const eslintResult = run("pnpm", ["exec", "eslint", "--fix", filePath], cwd);
    if (eslintResult.status !== 0) {
      process.stderr.write(
        `[post-edit] eslint still reports issues in ${filePath}:\n${eslintResult.stdout ?? ""}\n`,
      );
    }
  }

  if (CONTRACT_FILE.test(normalized)) {
    const result = run("pnpm", ["contracts:validate"], cwd);
    if (result.status !== 0) {
      process.stderr.write(
        `[post-edit] pnpm contracts:validate failed after editing ${filePath}:\n${result.stdout ?? ""}${result.stderr ?? ""}\n`,
      );
      process.exit(2);
    }
  }
}

main();
