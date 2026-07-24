import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envLocal = path.join(backendRoot, ".env.local");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    out[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return out;
}

const fromFile = loadEnvFile(envLocal);
const env = {
  ...process.env,
  ...fromFile,
  NODE_ENV: "development",
  SERVICE_NAME: "api",
  PORT: fromFile.PORT || "3000",
  SESSION_COOKIE_SECURE: "false",
  LOG_LEVEL: "info",
};

if (!env.DATABASE_URL) {
  console.error("Missing DATABASE_URL in .env.local");
  process.exit(1);
}

const child = spawn("pnpm", ["exec", "tsx", "apps/api/src/main.ts"], {
  cwd: backendRoot,
  env,
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code) => process.exit(code ?? 1));
