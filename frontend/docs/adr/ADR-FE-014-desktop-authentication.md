# ADR-FE-014: Desktop authentication

**Status:** Accepted

## Context

The desktop client (ADR-FE-003) cannot use the web's same-origin BFF cookie flow (no browser
same-origin context) and must not let an embedded WebView collect the user's IdP credentials
directly (a classic native-app OAuth phishing risk).

## Decision

Authorization Code + PKCE via the system browser (not an embedded WebView); the refresh token is
stored only in the OS credential vault or an encrypted Stronghold managed by the Rust layer — the
React/WebView layer only ever receives a session abstraction, never the raw refresh token.

## Consequences

- `apps/windows-client/src-tauri/CAPABILITY_POLICY.md` explicitly defers the `shell:allow-open`
  capability (needed to launch the system browser) and the Stronghold plugin until this ADR is
  actually implemented (F01/F10) — F00's Tauri capability set stays `core:default` only.
- `packages/platform`'s `CredentialVaultAdapter` interface is defined in F00 (store/retrieve/remove)
  but has no Tauri-backed implementation yet — only the interface, so features can be written
  against it before the native implementation lands.
- Device registration happens only after a successful login (spec 9.2) — not before.
