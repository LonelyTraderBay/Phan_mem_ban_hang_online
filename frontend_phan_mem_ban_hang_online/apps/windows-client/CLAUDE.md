# @ai-sales/windows-client

Windows desktop shell: Tauri 2 + React, a thin wrapper reusing web-admin's packages (ADR-FE-003).
Desktop-specific behavior is confined to `@ai-sales/platform` adapters and desktop auth
(ADR-FE-014) — this app should stay thin.

- Dependencies are deliberately narrow: `config`, `i18n`, `platform`, `telemetry`, `ui` — **not**
  `api-client`, `auth`, `realtime`, or `state`. Those stay web-only until this app actually needs
  them; don't add them speculatively.
- Dev loop (from `docs/runbooks/local-setup.md`):
  ```sh
  cd apps/windows-client
  cargo check --manifest-path src-tauri/Cargo.toml   # verifies the Rust side compiles
  pnpm dev                                            # Vite dev server only, :5175
  ```
  There's no working Tauri window yet — full `tauri dev` wiring is F10's job. `pnpm tauri` is
  available (via `@tauri-apps/cli`) but not part of the current day-to-day loop.
- No `test` script yet (only `typecheck`, `lint`, `tauri`).
- The desktop capability allow-list lives in `src-tauri/CAPABILITY_POLICY.md` — it documents why
  `shell:allow-open`/Stronghold are deferred until desktop auth (ADR-FE-014) is implemented. This
  is the closest thing to a threat-model artefact that exists for this app today (see
  `docs/threat-model/README.md`) — check it before adding new Tauri capabilities.
