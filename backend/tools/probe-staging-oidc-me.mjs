#!/usr/bin/env node
/**
 * Staging cutover probe: health → OIDC start → IdP → callback → GET /me.
 * Usage: node tools/probe-staging-oidc-me.mjs [API_BASE_URL]
 * Defaults to STAGING_API_BASE_URL from env or .env.staging (API URL only).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function loadApiBase() {
  if (process.argv[2]) return process.argv[2].replace(/\/$/, "");
  if (process.env.STAGING_API_BASE_URL) {
    return process.env.STAGING_API_BASE_URL.replace(/\/$/, "");
  }
  try {
    const raw = readFileSync(path.join(ROOT, ".env.staging"), "utf8");
    const line = raw.split(/\r?\n/).find((l) => l.startsWith("STAGING_API_BASE_URL="));
    if (line) return line.slice("STAGING_API_BASE_URL=".length).trim().replace(/\/$/, "");
  } catch {
    /* missing */
  }
  throw new Error("Pass API base URL or set STAGING_API_BASE_URL");
}

function cookieJar(setCookieHeaders) {
  const jar = new Map();
  for (const raw of setCookieHeaders) {
    const part = raw.split(";")[0];
    const eq = part.indexOf("=");
    if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
  }
  return jar;
}

function mergeCookies(jar, setCookieHeaders) {
  for (const [k, v] of cookieJar(setCookieHeaders)) jar.set(k, v);
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function main() {
  const api = loadApiBase();
  const jar = new Map();
  const report = [];

  const health = await fetch(`${api}/health`);
  report.push(`health=${health.status}`);
  if (health.status !== 200) {
    console.error(report.join("\n"));
    process.exit(1);
  }

  // Direct API uses /api/v1/...; FE BFF proxy (Vite/nginx) uses /api/... → /api/v1/...
  const oidcPrefix =
    process.env.OIDC_PATH_PREFIX?.trim() ||
    (api.includes("web-admin") || api.includes("phan-mem-ban-hang-online-web") ? "/api" : "/api/v1");
  const start = await fetch(`${api}${oidcPrefix}/auth/oidc/start?return_to=%2F`, {
    redirect: "manual",
    headers: { cookie: cookieHeader(jar) },
  });
  mergeCookies(jar, start.headers.getSetCookie?.() ?? []);
  const idp = start.headers.get("location");
  report.push(`oidc_start=${start.status} idp_host=${idp ? new URL(idp).host : "none"} prefix=${oidcPrefix}`);
  if (!idp || start.status < 300 || start.status >= 400) {
    console.error(report.join("\n"));
    process.exit(1);
  }

  const auth = await fetch(idp, { redirect: "manual", headers: { cookie: cookieHeader(jar) } });
  mergeCookies(jar, auth.headers.getSetCookie?.() ?? []);
  let callback = auth.headers.get("location");
  // Some IdPs return 200 HTML with meta refresh — staging mock uses 302 to callback
  if (!callback && auth.status === 200) {
    const html = await auth.text();
    const m = html.match(/url=([^"'\s>]+)/i) || html.match(/href="([^"]+callback[^"]*)"/i);
    if (m) callback = m[1];
  }
  report.push(`idp=${auth.status} callback=${callback ? "yes" : "no"}`);
  if (!callback) {
    console.error(report.join("\n"));
    process.exit(1);
  }

  const cb = await fetch(callback, {
    redirect: "manual",
    headers: { cookie: cookieHeader(jar) },
  });
  mergeCookies(jar, cb.headers.getSetCookie?.() ?? []);
  report.push(`callback=${cb.status} cookies=${[...jar.keys()].join(",") || "none"}`);
  if (!jar.has("ais_session") && !jar.has(process.env.SESSION_COOKIE_NAME || "ais_session")) {
    // tolerate alternate cookie name from env
    const hasSession = [...jar.keys()].some((k) => /session/i.test(k));
    if (!hasSession) {
      console.error(report.join("\n"));
      process.exit(1);
    }
  }

  const me = await fetch(`${api}${oidcPrefix === "/api" ? "/api/me" : "/api/v1/me"}`, {
    headers: { cookie: cookieHeader(jar), accept: "application/json" },
  });
  const meBody = await me.text();
  report.push(`me=${me.status}`);
  if (me.status !== 200) {
    console.error(report.join("\n"));
    console.error(meBody.slice(0, 400));
    process.exit(1);
  }
  let parsed;
  try {
    parsed = JSON.parse(meBody);
  } catch {
    console.error(report.join("\n"));
    console.error("me body not JSON");
    process.exit(1);
  }
  const data = parsed.data ?? parsed;
  const tenant = data.tenant?.display_name ?? data.tenant?.name ?? data.tenant_id ?? "?";
  const perms = Array.isArray(data.permissions) ? data.permissions.length : "?";
  report.push(`tenant=${tenant} perms=${perms}`);
  console.log(report.join("\n"));
  console.log("PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
