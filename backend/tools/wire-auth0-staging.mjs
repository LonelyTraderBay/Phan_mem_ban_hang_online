#!/usr/bin/env node
/**
 * Wire Auth0 Free into .env.staging (local, never commit).
 * Reads backend/.auth0-staging.env then rewrites OIDC_* for Fly Web Admin BFF.
 *
 * Usage: node tools/wire-auth0-staging.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const auth0Path = path.join(root, ".auth0-staging.env");
const envPath = path.join(root, ".env.staging");
const webAdmin = "https://phan-mem-ban-hang-online-web.fly.dev";

function parseEnv(raw) {
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

function upsert(envText, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(envText)) return envText.replace(re, line);
  return `${envText.trimEnd()}\n${line}\n`;
}

if (!existsSync(auth0Path)) {
  console.error("Missing backend/.auth0-staging.env — see docs/release/HARDENING-H1-AUTH0.md");
  process.exit(1);
}
if (!existsSync(envPath)) {
  console.error("Missing backend/.env.staging");
  process.exit(1);
}

const a = parseEnv(readFileSync(auth0Path, "utf8"));
const domain = (a.AUTH0_DOMAIN || a.OIDC_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
const clientId = a.AUTH0_CLIENT_ID || a.OIDC_CLIENT_ID;
const clientSecret = a.AUTH0_CLIENT_SECRET || a.OIDC_CLIENT_SECRET;
if (!domain || !clientId || !clientSecret) {
  console.error("Need AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET in .auth0-staging.env");
  process.exit(1);
}

const issuer = `https://${domain}/`;
let env = readFileSync(envPath, "utf8");
const pairs = {
  OIDC_ENABLED: "true",
  OIDC_ISSUER: issuer,
  OIDC_CLIENT_ID: clientId,
  OIDC_CLIENT_SECRET: clientSecret,
  OIDC_REDIRECT_URI: `${webAdmin}/api/auth/oidc/callback`,
  OIDC_SCOPES: "openid profile email",
  OIDC_AUTHORIZATION_ENDPOINT: `https://${domain}/authorize`,
  OIDC_TOKEN_ENDPOINT: `https://${domain}/oauth/token`,
};

for (const [k, v] of Object.entries(pairs)) env = upsert(env, k, v);
writeFileSync(envPath, env.endsWith("\n") ? env : `${env}\n`);
console.log("Wired Auth0 into .env.staging (secrets not printed)");
console.log(`issuer=${issuer}`);
console.log(`redirect=${pairs.OIDC_REDIRECT_URI}`);
console.log("Next: node tools/preflight-staging-env.mjs");
console.log("Then: Get-Content .env.staging | flyctl secrets import -a ai-sales-api-staging");
