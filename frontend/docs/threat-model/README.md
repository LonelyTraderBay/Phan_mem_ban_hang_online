# Threat model

Stub — spec section 15.2 requires a minimal frontend threat model as one of the mandatory F00
artefacts (spec section 29). A full threat model is a Security-team-led exercise (STRIDE or
similar over the auth flow, session handling, PII display, and desktop credential storage), not
something to author unilaterally as part of scaffolding.

## What exists today

- `apps/windows-client/src-tauri/CAPABILITY_POLICY.md` documents the desktop capability
  allow-list and the rationale for deferring `shell:allow-open`/Stronghold until desktop auth
  (ADR-FE-014) is implemented — this is the closest thing to a threat-model artefact that exists
  in this scaffold.
- `packages/telemetry/src/redact.ts` documents what's scrubbed before telemetry leaves the
  process (spec 15.x baseline).

## What's missing

A real threat model covering: session/cookie handling (ADR-FE-013), cross-tenant data isolation
in the query cache (spec 13.2's tenant-scoped keys — risk R02 in the frontend spec's risk
register), PII field masking (spec 10.3), and the desktop credential vault (ADR-FE-014) once it's
implemented. Track this as a prerequisite for any module reaching a `READY-INTEGRATION` gate that
touches PII or payment data (spec 1.5's readiness scale).
