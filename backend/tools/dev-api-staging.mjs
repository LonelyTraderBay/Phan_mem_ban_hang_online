#!/usr/bin/env node
/**
 * Start API with backend/.env.staging (BE-FND-015 cutover).
 * Fails if preflight-staging-env would fail — run that first.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(backendRoot, process.env.STAGING_ENV_FILE?.trim() || ".env.staging");

const pre = spawnSync(process.execPath, [path.join(backendRoot, "tools/preflight-staging-env.mjs")], {
  cwd: backendRoot,
  env: process.env,
  stdio: "inherit",
});
if ((pre.status ?? 1) !== 0) process.exit(pre.status ?? 1);

function loadEnvFile(filePath) {
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

if (!existsSync(envFile)) {
  console.error("Missing", envFile);
  process.exit(1);
}

const fromFile = loadEnvFile(envFile);
const cleaned = { ...process.env };
for (const key of Object.keys(cleaned)) {
  if (key.startsWith("OIDC_") || key === "DATABASE_URL" || key.startsWith("SESSION_")) {
    delete cleaned[key];
  }
}
const env = {
  ...cleaned,
  ...fromFile,
  NODE_ENV: fromFile.NODE_ENV || "production",
  SERVICE_NAME: fromFile.SERVICE_NAME || "api",
};

// Avoid shell:true on Windows — it can drop custom env for nested pnpm/tsx.
const tsxCli = path.join(backendRoot, "node_modules", "tsx", "dist", "cli.mjs");
const child = spawn(process.execPath, [tsxCli, "apps/api/src/main.ts"], {
  cwd: backendRoot,
  env,
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code) => process.exit(code ?? 1));
