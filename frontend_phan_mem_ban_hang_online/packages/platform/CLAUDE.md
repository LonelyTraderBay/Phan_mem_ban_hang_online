# @ai-sales/platform

Platform adapter interfaces — storage, notification, print, deep-link, credential vault — so
platform-specific code (browser vs Tauri/Windows) only ever goes through this package (spec 3.4).
Features and `packages/ui` depend on the interface, never on `window`/`navigator`/`@tauri-apps/*`
directly.

- Zero runtime dependencies.
- **Only web adapters are implemented today**: `createWebStorageAdapter`,
  `createWebNotificationAdapter`, `createWebDeepLinkAdapter`. `CredentialVaultAdapter` is exported
  as a type only — no concrete implementation (web or Tauri) exists yet. There's no Tauri adapter
  for anything yet, despite `apps/windows-client` existing.
- No test script (no `tests/` directory either) — only `typecheck`/`lint`. No README.
