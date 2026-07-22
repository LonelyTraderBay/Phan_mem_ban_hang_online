# @ai-sales/permissions

Typed permission registry + gating hooks, generated from
`contracts/permissions/permission-matrix.yaml` (spec 10.x, FE-F00-007).

- Permissions always come from the session bootstrap payload as specific permission strings,
  never a single role name (spec 9.3/10.1).
- **Fail closed**: an unrecognized or stale permission key in `usePermission` always resolves to
  denied — never throws, never defaults to allowed (FE-F00-007 step 4).
- If the server 403s despite the client believing a permission was granted (stale registry), that
  must never be a silent no-op — record telemetry via `reportPermissionMismatch` and render a
  forbidden state (spec 10.4).
- `src/generated/permissionKeys.ts` is generated from the backend's `permission_matrix.csv` via
  `pnpm contracts:sync` — see `.claude/rules/contracts-codegen.md`. Never hand-edit it.
- No `test:e2e` or `codegen` script of its own; standard `typecheck`/`lint`/`test` only. No README.
