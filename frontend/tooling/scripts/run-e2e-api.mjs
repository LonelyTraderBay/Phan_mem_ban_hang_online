import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const result = spawnSync(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["exec", "playwright", "test", "--config=playwright.config.ts", "--project=chromium-api"],
  {
    cwd: frontendRoot,
    env: { ...process.env, E2E_AGAINST_API: "1" },
    stdio: "inherit",
    shell: true,
  },
);

process.exit(result.status ?? 1);
