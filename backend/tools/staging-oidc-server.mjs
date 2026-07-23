#!/usr/bin/env node
/**
 * Minimal OIDC IdP for staging cutover when Auth0 is not yet provisioned.
 * Supports HTTPS public issuer via MOCK_OIDC_ISSUER (e.g. Cloudflare tunnel).
 *
 * Not a production IdP — unsigned id_token (alg none), same as local mock.
 */
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

const port = Number(process.env.MOCK_OIDC_PORT ?? 9090);
const publicBase = (process.env.MOCK_OIDC_ISSUER ?? `http://127.0.0.1:${port}`).replace(/\/$/, "");
const issuer = publicBase;
const email = process.env.MOCK_OIDC_EMAIL ?? "owner@staging.ai-sales.local";
const sub = process.env.MOCK_OIDC_SUB ?? "staging-owner-sub";
const name = process.env.MOCK_OIDC_NAME ?? "Staging Owner";
const clientId = process.env.MOCK_OIDC_CLIENT_ID ?? "web-admin-staging";

/** @type {Map<string, { nonce: string | null, redirectUri: string }>} */
const codes = new Map();

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function makeIdToken(nonce) {
  const header = b64url({ alg: "none", typ: "JWT" });
  const payload = b64url({
    iss: issuer,
    sub,
    email,
    email_verified: true,
    name,
    nonce: nonce ?? undefined,
    aud: clientId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return `${header}.${payload}.`;
}

function sendJson(res, status, body) {
  const raw = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(raw),
    "access-control-allow-origin": "*",
  });
  res.end(raw);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization",
    });
    return res.end();
  }

  const url = new URL(req.url ?? "/", "http://127.0.0.1");

  if (req.method === "GET" && url.pathname === "/.well-known/openid-configuration") {
    return sendJson(res, 200, {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["none"],
      scopes_supported: ["openid", "profile", "email"],
    });
  }

  if (req.method === "GET" && url.pathname === "/authorize") {
    const redirectUri = url.searchParams.get("redirect_uri");
    const state = url.searchParams.get("state");
    const nonce = url.searchParams.get("nonce");
    if (!redirectUri || !state) {
      res.writeHead(400, { "content-type": "text/plain" });
      return res.end("missing redirect_uri or state");
    }
    const code = randomBytes(24).toString("base64url");
    codes.set(code, { nonce, redirectUri });
    const loc = new URL(redirectUri);
    loc.searchParams.set("code", code);
    loc.searchParams.set("state", state);
    res.writeHead(302, { Location: loc.toString() });
    return res.end();
  }

  if (req.method === "POST" && url.pathname === "/token") {
    const raw = await readBody(req);
    const params = new URLSearchParams(raw);
    const code = params.get("code");
    const stored = code ? codes.get(code) : undefined;
    if (!code || !stored) {
      return sendJson(res, 400, { error: "invalid_grant" });
    }
    codes.delete(code);
    return sendJson(res, 200, {
      access_token: "mock-access",
      token_type: "Bearer",
      expires_in: 3600,
      id_token: makeIdToken(stored.nonce),
    });
  }

  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, { status: "ok", issuer, email });
  }

  res.writeHead(404);
  res.end("not found");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`staging-oidc listening :${port} issuer=${issuer} email=${email}`);
});
