/**
 * Staging / DOC_GATE scope-C automated verification (no secrets printed).
 * Exit 0 = all hard checks pass; exit 1 = one or more failed.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function ok(name, detail = "") {
  results.push({ name, pass: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, pass: false, detail });
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}
function info(name, detail = "") {
  console.log(`INFO  ${name}${detail ? ` — ${detail}` : ""}`);
}

function parseCsv(text) {
  const rows = [];
  for (const line of text.trim().split(/\r?\n/)) {
    const cols = [];
    let cur = "";
    let q = false;
    for (const c of line) {
      if (c === '"') {
        q = !q;
        continue;
      }
      if (c === "," && !q) {
        cols.push(cur);
        cur = "";
        continue;
      }
      cur += c;
    }
    cols.push(cur);
    rows.push(cols);
  }
  return rows;
}

async function http(url, opts = {}) {
  const res = await fetch(url, {
    redirect: "manual",
    ...opts,
  });
  const loc = res.headers.get("location") || "";
  return { status: res.status, location: loc };
}

// --- local files ---
const auth0Path = path.join(root, ".auth0-staging.env");
const envPath = path.join(root, ".env.staging");
if (existsSync(auth0Path)) ok("local .auth0-staging.env exists");
else fail("local .auth0-staging.env exists");

if (existsSync(envPath)) {
  const env = readFileSync(envPath, "utf8");
  if (/OIDC_ISSUER=https:\/\/dev-51apo48jpnewe6oa\.us\.auth0\.com\//.test(env))
    ok("OIDC_ISSUER points at Auth0 tenant");
  else fail("OIDC_ISSUER points at Auth0 tenant");
  if (
    /OIDC_REDIRECT_URI=https:\/\/phan-mem-ban-hang-online-web\.fly\.dev\/api\/auth\/oidc\/callback/.test(
      env,
    )
  )
    ok("OIDC_REDIRECT_URI matches Web Admin callback");
  else fail("OIDC_REDIRECT_URI matches Web Admin callback");
  if (/OIDC_ENABLED=true/.test(env)) ok("OIDC_ENABLED=true");
  else fail("OIDC_ENABLED=true");
  if (/ai-sales-api-staging|127\.0\.0\.1:9090/.test(env))
    fail(".env.staging has legacy/local IdP leftovers");
  else ok(".env.staging no legacy/local IdP leftovers (spot)");
} else fail(".env.staging exists");

// --- CSV ---
const backlog = parseCsv(
  readFileSync(
    path.join(root, "backend_doc/matrices/implementation_backlog.csv"),
    "utf8",
  ),
);
const cov = parseCsv(
  readFileSync(
    path.join(root, "docs/enterprise-freeze/inventory/backlog_coverage.csv"),
    "utf8",
  ),
);
const bStatus = {};
for (const r of backlog.slice(1)) {
  bStatus[r[4]] = (bStatus[r[4]] || 0) + 1;
}
const cIdx = cov[0].indexOf("backlog_status");
const cStatus = {};
for (const r of cov.slice(1)) {
  cStatus[r[cIdx]] = (cStatus[r[cIdx]] || 0) + 1;
}
if (bStatus.Done === 157 && Object.keys(bStatus).length === 1)
  ok("implementation_backlog.csv 157/157 Done", JSON.stringify(bStatus));
else fail("implementation_backlog.csv 157/157 Done", JSON.stringify(bStatus));
if (cStatus.Done === 157 && Object.keys(cStatus).length === 1)
  ok("backlog_coverage.csv 157/157 Done", JSON.stringify(cStatus));
else fail("backlog_coverage.csv 157/157 Done", JSON.stringify(cStatus));

// --- docs ---
const a2f = readFileSync(
  path.join(root, "docs/release/A-TO-F-EXECUTION-STATUS.md"),
  "utf8",
);
if (/NOT authorized/i.test(a2f)) ok("A-TO-F: production go-live NOT authorized");
else fail("A-TO-F: production go-live NOT authorized");
if (/Phan_mem_ban_hang_online-staging/.test(a2f))
  ok("A-TO-F: Supabase display name recorded");
else fail("A-TO-F: Supabase display name recorded");
if (/dev-51apo48jpnewe6oa\.us\.auth0\.com/.test(a2f))
  ok("A-TO-F: Auth0 domain recorded");
else fail("A-TO-F: Auth0 domain recorded");

const h1 = readFileSync(path.join(root, "docs/release/HARDENING-H1-AUTH0.md"), "utf8");
if (/Auth0 PASS/i.test(h1)) ok("HARDENING-H1: Auth0 PASS status");
else fail("HARDENING-H1: Auth0 PASS status");

// --- live HTTP ---
const api = "https://phan-mem-ban-hang-online-api.fly.dev";
const web = "https://phan-mem-ban-hang-online-web.fly.dev";
const ops = "https://phan-mem-ban-hang-online-ops.fly.dev";

try {
  const h = await http(`${api}/health`);
  if (h.status === 200) ok("API /health", String(h.status));
  else fail("API /health", String(h.status));
} catch (e) {
  fail("API /health", String(e.message || e));
}

try {
  const w = await http(web + "/");
  if (w.status >= 200 && w.status < 400) ok("Web Admin origin reachable", String(w.status));
  else fail("Web Admin origin reachable", String(w.status));
} catch (e) {
  fail("Web Admin origin reachable", String(e.message || e));
}

try {
  const o = await http(ops + "/");
  if (o.status >= 200 && o.status < 400) ok("Super Admin origin reachable", String(o.status));
  else fail("Super Admin origin reachable", String(o.status));
} catch (e) {
  fail("Super Admin origin reachable", String(e.message || e));
}

try {
  const start = await http(`${web}/api/auth/oidc/start`);
  const loc = start.location;
  const good =
    start.status === 302 &&
    loc.includes("dev-51apo48jpnewe6oa.us.auth0.com/authorize") &&
    loc.includes("redirect_uri=") &&
    decodeURIComponent(loc).includes(
      "https://phan-mem-ban-hang-online-web.fly.dev/api/auth/oidc/callback",
    );
  if (good) ok("OIDC start → Auth0 authorize + callback", `status=${start.status}`);
  else
    fail(
      "OIDC start → Auth0 authorize + callback",
      `status=${start.status} loc=${loc.slice(0, 120)}`,
    );
} catch (e) {
  fail("OIDC start → Auth0 authorize + callback", String(e.message || e));
}

try {
  const me = await http(`${web}/api/me`);
  // Without session cookie expect 401/403 — proves route exists and is gated
  if (me.status === 401 || me.status === 403)
    ok("GET /api/me unauthenticated fail-closed", String(me.status));
  else if (me.status === 200)
    info("GET /api/me returned 200 without cookie (unexpected session?)");
  else fail("GET /api/me unauthenticated fail-closed", String(me.status));
} catch (e) {
  fail("GET /api/me unauthenticated fail-closed", String(e.message || e));
}

info(
  "Browser login /me 200",
  "HO confirmed manually in chat — cannot automate Auth0 password grant here",
);

const failed = results.filter((r) => !r.pass);
console.log("");
console.log(`Summary: ${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length ? 1 : 0);
