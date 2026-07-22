# Tauri capability policy (ADR-FE-003, spec 20.3)

`capabilities/default.json` grants only `core:default` (window management) today — no
filesystem, shell, or network-beyond-webview capability is enabled (FE-F00-002 step 5:
"Windows app chỉ bật capability tối thiểu").

## Capabilities added later, not now

- **`shell:allow-open`** (opens the system browser for the OIDC Authorization Code + PKCE flow,
  ADR-FE-014) — added when F01 (Auth) implements desktop login, not before.
- **Stronghold plugin** (encrypted credential vault for the refresh token, ADR-FE-014: "Frontend
  WebView chỉ nhận session abstraction, không nhận refresh token raw") — added at the same time.
- **Notification / printing plugins** — added when F00's `NotificationAdapter`/`PrintAdapter`
  interfaces (`packages/platform`) get their Tauri-backed implementations, likely alongside F10
  (Windows Client Production).

Any new capability requires updating this file's rationale, not just the JSON.
