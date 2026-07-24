/**
 * Starts Backend API for Playwright E2E_AGAINST_API=1.
 * Loads backend/.env.local when present; requires DATABASE_URL.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "../..");
const backendRoot = path.resolve(frontendRoot, "../backend");
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
  NODE_ENV: process.env.NODE_ENV ?? "development",
  SERVICE_NAME: "api",
  PORT: process.env.E2E_API_PORT ?? fromFile.PORT ?? "3000",
  SESSION_COOKIE_SECURE: "false",
  LOG_LEVEL: process.env.LOG_LEVEL ?? "warn",
};

if (!env.DATABASE_URL?.trim()) {
  console.error(
    "E2E against API requires DATABASE_URL (set in backend/.env.local or the environment).",
  );
  process.exit(1);
}

const child = spawn("pnpm", ["exec", "tsx", "apps/api/src/main.ts"], {
  cwd: backendRoot,
  env,
  stdio: "inherit",
  shell: true,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
