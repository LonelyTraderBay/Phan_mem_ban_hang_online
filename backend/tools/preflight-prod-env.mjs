#!/usr/bin/env node
/**
 * Preflight for production cutover (H9).
 * Loads `.env.production` (or PROD_ENV_FILE) — fail closed on placeholders / staging hosts.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.resolve(backendRoot, process.env.PROD_ENV_FILE?.trim() || ".env.production");

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return null;
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

const required = [
  "DATABASE_URL",
  "OIDC_ENABLED",
  "OIDC_ISSUER",
  "OIDC_CLIENT_ID",
  "OIDC_CLIENT_SECRET",
  "OIDC_REDIRECT_URI",
  "SESSION_COOKIE_SECURE",
];

const errors = [];
const warnings = [];
const env = loadEnvFile(envPath);

if (!env) {
  console.error(`FAIL: missing ${envPath}`);
  console.error("Create backend/.env.production from HO vault (see docs/release/HO-ACTION-PROD.md).");
  process.exit(1);
}

for (const key of required) {
  const value = env[key]?.trim();
  if (!value) errors.push(`missing ${key}`);
  else if (/REPLACE_|change-me|local-dev-secret|127\.0\.0\.1:9090|localhost:5173/i.test(value)) {
    errors.push(`${key} still has placeholder / local-only value`);
  }
}

if (env.OIDC_ENABLED !== "true") errors.push("OIDC_ENABLED must be true on production");
if (env.SESSION_COOKIE_SECURE !== "true") errors.push("SESSION_COOKIE_SECURE must be true on production");
if (env.OIDC_REDIRECT_URI && !env.OIDC_REDIRECT_URI.startsWith("https://")) {
  errors.push("OIDC_REDIRECT_URI must be https:// on production");
}
if (env.OIDC_REDIRECT_URI && !env.OIDC_REDIRECT_URI.includes("web-prod")) {
  errors.push("OIDC_REDIRECT_URI must target phan-mem-ban-hang-online-web-prod callback");
}
if (env.DATABASE_URL?.includes("127.0.0.1") || env.DATABASE_URL?.includes("localhost")) {
  errors.push("DATABASE_URL points at localhost");
}
if (env.DATABASE_URL?.includes("lrcsbrmqlyvkxxspbezi")) {
  errors.push("DATABASE_URL still points at staging Supabase ref — use prod project");
}
if (!env.REDIS_URL || /REPLACE_|localhost/i.test(env.REDIS_URL)) {
  warnings.push("REDIS_URL unset — N/A v1 expected");
}

if (errors.length) {
  console.error("Production preflight FAILED:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("Production preflight OK:", path.relative(backendRoot, envPath));
for (const w of warnings) console.log("  warn:", w);
process.exit(0);
