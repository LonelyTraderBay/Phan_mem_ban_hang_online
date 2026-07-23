# ASVS agent self-check evidence (BE-HRD-001) — 2026-07-23

**Scope:** Automated checks against staging HTTPS API (Cloudflare tunnel) per [`ASVS-PENTEST-SCOPE.md`](./ASVS-PENTEST-SCOPE.md).  
**Mode:** HO-delegated agent scanner (not a third-party pentest firm). Full vendor pentest remains recommended before production go-live.

| ID | Check | Result |
|---|---|---|
| C-1 | Health over HTTPS | PASS — `GET /health` 200 |
| C-2 | OIDC start 302 to IdP | PASS — Location host = staging OIDC tunnel |
| C-3 | Callback sets `Secure; HttpOnly` session cookie | PASS — `ais_session` + `csrf_token` Secure |
| C-4 | `GET /me` 200 after OIDC | PASS — Staging Tenant + permissions |
| C-5 | No secrets in OUTBOX/evidence | PASS |
| C-6 | SESSION_COOKIE_SECURE=true | PASS — preflight |
| C-7 | DB not localhost | PASS — Supabase pooler |
| Crit/High open | — | **None observed** in this slice |

**Ticket:** propose `BE-HRD-001` Done for *agent ASVS smoke*; optional vendor retest later.

## H7 confirmation (2026-07-23 hardening)

HO-delegated wave **keeps agent self-check** as the active control until production go-live.  
Vendor pentest remains **recommended** before H9; not booked in this wave. No Crit/High open in self-check slice.
