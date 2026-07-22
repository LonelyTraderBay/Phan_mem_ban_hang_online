# @ai-sales/telemetry

Provider-neutral telemetry interface (errors, events, traces) with mandatory PII redaction
(spec 15.x, 16.x, FE-F00-008). Concrete adapter is `@sentry/react`.

- **Nothing outside this package may import `@sentry/*` directly** (FE-F00-008 step 1) — always
  go through this package's `TelemetryAdapter` interface, including `createSentryAdapter` /
  `createConsoleAdapter`.
- Redaction is enforced structurally, not by convention: both the Sentry adapter's `beforeSend` and
  the dev console adapter run every payload through the scrub functions. Request bodies are
  **default-deny** — `scrubBody` returns `undefined` unless an explicit field allowlist is passed.
- `scrubText` (regex-based email/phone-like redaction for free-text fields) is explicitly
  best-effort — "not a substitute for not sending PII in the first place." Don't treat it as
  exhaustive PII protection.
- Every error report must carry the three fields spec 5.3 requires (`context.ts`).
- No README; constraints live as inline comments in `interface.ts`, `redact.ts`, `context.ts`.
