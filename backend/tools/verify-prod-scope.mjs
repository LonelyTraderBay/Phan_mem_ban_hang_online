#!/usr/bin/env node
/**
 * Production smoke verify (H9). Hosts only — no secrets required for health/OIDC redirect checks.
 * Usage: node tools/verify-prod-scope.mjs
 */
const API = process.env.PROD_API_BASE_URL || "https://phan-mem-ban-hang-online-api-prod.fly.dev";
const WEB = process.env.PROD_WEB_BASE_URL || "https://phan-mem-ban-hang-online-web-prod.fly.dev";
const OPS = process.env.PROD_OPS_BASE_URL || "https://phan-mem-ban-hang-online-ops-prod.fly.dev";

let pass = 0;
let fail = 0;
const results = [];

async function check(name, fn) {
  try {
    await fn();
    results.push(`PASS  ${name}`);
    pass += 1;
  } catch (e) {
    results.push(`FAIL  ${name} — ${e instanceof Error ? e.message : String(e)}`);
    fail += 1;
  }
}

await check("API /health", async () => {
  const r = await fetch(`${API}/health`);
  if (r.status !== 200) throw new Error(`status ${r.status}`);
});

await check("Web origin reachable", async () => {
  const r = await fetch(WEB, { redirect: "manual" });
  if (r.status >= 500) throw new Error(`status ${r.status}`);
});

await check("Ops origin reachable", async () => {
  const r = await fetch(OPS, { redirect: "manual" });
  if (r.status >= 500) throw new Error(`status ${r.status}`);
});

await check("OIDC start → authorize redirect", async () => {
  const r = await fetch(`${API}/api/auth/oidc/start`, { redirect: "manual" });
  if (r.status !== 302) throw new Error(`status ${r.status}`);
  const loc = r.headers.get("location") || "";
  if (!/auth0\.com|authorize/i.test(loc)) throw new Error(`unexpected location`);
});

await check("/api/me unauthenticated fail-closed", async () => {
  const r = await fetch(`${API}/api/me`);
  if (r.status !== 401) throw new Error(`status ${r.status}`);
});

for (const line of results) console.log(line);
console.log(`\nSummary: ${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
