# ADR-FE-003: Desktop client

**Status:** Accepted

## Context

Windows users need a native-feeling app (system tray, printing, notifications, secure credential
storage) without shipping a full Electron/Chromium runtime per install.

## Decision

Tauri 2 for the Windows desktop client — small footprint, explicit capability model, WebView2
(Evergreen) as the render surface, Rust backend for native integration.

## Consequences

- Capability policy must stay minimal by default (spec 20.3, FE-F00-002 step 5) — see
  `apps/windows-client/src-tauri/CAPABILITY_POLICY.md` for what's enabled now (`core:default`
  only) vs added later (shell-open for OIDC, Stronghold for the credential vault, ADR-FE-014).
- Confirmed during F00 scaffolding: `cargo check` compiles cleanly against Rust/Cargo 1.96.0 with
  the default `tauri init` scaffold — no toolchain blocker found on this machine. A real
  `cargo tauri build` (full release compile) was not run in F00 — that's part of F10's technical
  spike (FE-F10-001), which is explicitly gated on the Web vertical slice landing first.
- WebView2 Evergreen runtime is a hard Windows Client baseline requirement (spec 5.4) — desktop
  install docs must call this out.
