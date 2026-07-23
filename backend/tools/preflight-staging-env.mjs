#!/usr/bin/env node
/**
 * Preflight for staging cutover (BE-FND-015 / BE-IDN-003).
 * Loads `.env.staging` (or path from STAGING_ENV_FILE) and fails closed if required vars missing
 * or still contain REPLACE_ placeholders / local mock IdP.
 *
 * Usage:
 *   node tools/preflight-staging-env.mjs
 *   STAGING_ENV_FILE=.env.staging node tools/preflight-staging-env.mjs
 *
 * Exit 0 = ready for migrate/smoke/OIDC cutover.
 * Exit 1 = HO must finish HO-STAGING-CHECKLIST and fill .env.staging.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.resolve(
  backendRoot,
  process.env.STAGING_ENV_FILE?.trim() || ".env.staging",
);

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
  console.error("Copy backend/.env.staging.example → backend/.env.staging and fill after HO sign-off.");
  console.error("See docs/release/HO-STAGING-CHECKLIST.md and docs/release/staging-cutover.md");
  process.exit(1);
}

for (const key of required) {
  const value = env[key]?.trim();
  if (!value) errors.push(`missing ${key}`);
  else if (/REPLACE_|change-me|local-dev-secret|127\.0\.0\.1:9090|localhost:5173/i.test(value)) {
    errors.push(`${key} still has placeholder / local-only value`);
  }
}

if (env.OIDC_ENABLED !== "true") {
  errors.push("OIDC_ENABLED must be true on staging");
}

if (env.SESSION_COOKIE_SECURE !== "true") {
  errors.push("SESSION_COOKIE_SECURE must be true on staging (HTTPS)");
}

if (env.OIDC_REDIRECT_URI && !env.OIDC_REDIRECT_URI.startsWith("https://")) {
  errors.push("OIDC_REDIRECT_URI must be https:// on staging");
}

if (env.DATABASE_URL?.includes("127.0.0.1") || env.DATABASE_URL?.includes("localhost")) {
  errors.push("DATABASE_URL points at localhost — BE-FND-015 requires managed staging DB");
}

if (!env.REDIS_URL || /REPLACE_|localhost/i.test(env.REDIS_URL)) {
  warnings.push("REDIS_URL unset or local — confirm N/A or set managed Redis (BE-FND-015)");
}

if (errors.length) {
  console.error("Staging preflight FAILED:");
  for (const e of errors) console.error(`  - ${e}`);
  if (warnings.length) {
    console.error("Warnings:");
    for (const w of warnings) console.error(`  - ${w}`);
  }
  console.error("\nDo not run migrate/smoke against laptop and claim BE-FND-015 Done.");
  process.exit(1);
}

console.log("Staging preflight OK:", path.relative(backendRoot, envPath));
for (const w of warnings) console.log("  warn:", w);
console.log("Next: docs/release/staging-cutover.md");
process.exit(0);
