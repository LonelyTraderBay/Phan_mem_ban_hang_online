#!/usr/bin/env node
/**
 * Minimal local OIDC IdP for AI Sales OS (PKCE + authorization_code).
 * Not for production — unsigned id_token is accepted by HttpOidcTokenClient (JWKS verify TBD).
 *
 * Endpoints:
 *   GET  /.well-known/openid-configuration
 *   GET  /authorize  → 302 to redirect_uri?code=&state=
 *   POST /token      → { id_token }
 *
 * Default: http://127.0.0.1:9090
 * Env:
 *   MOCK_OIDC_PORT=9090
 *   MOCK_OIDC_EMAIL=owner@dev.local
 *   MOCK_OIDC_SUB=dev-owner-sub
 *   MOCK_OIDC_NAME=Dev Owner
 */
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

const port = Number(process.env.MOCK_OIDC_PORT ?? 9090);
const issuer = `http://127.0.0.1:${port}`;
const email = process.env.MOCK_OIDC_EMAIL ?? "owner@dev.local";
const sub = process.env.MOCK_OIDC_SUB ?? "dev-owner-sub";
const name = process.env.MOCK_OIDC_NAME ?? "Dev Owner";

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
    aud: process.env.MOCK_OIDC_CLIENT_ID ?? "web-admin-local",
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
  const url = new URL(req.url ?? "/", issuer);

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

server.listen(port, "127.0.0.1", () => {
  console.log(`mock-oidc listening ${issuer} (email=${email})`);
});
