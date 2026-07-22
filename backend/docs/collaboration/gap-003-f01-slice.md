# GAP-003 F01 slice — permission key clarifications

**Status:** Closed (contract/docs restore 2026-07-21)  
**Scope:** F01 Auth / Identity / Tenant admin permission naming only. Broader GAP-003 (F02/F04–F08/F10) remains Open on the gap board.

## Decisions

### `role.write` → `role.manage`

F01 role/permission mutation APIs use permission key **`role.manage`**, not `role.write`.

- Catalog / OpenAPI `x-permission` for create/update/delete role and assign-permissions must reference `role.manage`.
- Frontend permission registry and gates for F01 role screens must align to `role.manage`.
- Do not introduce a parallel `role.write` alias; treat historical `role.write` mentions as obsolete naming.
- Matrix already lists `role.manage` (`backend_doc/matrices/permission_matrix.csv`).

### `authenticated` is a session gate, not a permission

`x-permission: authenticated` (e.g. `GET /me`) means: request must carry a valid authenticated session. It is **not** a string in the `permissions[]` array returned by SessionBootstrap.

- Session gate: middleware / auth guard checks session validity before the handler runs.
- Authorization for resource operations still uses concrete permission strings (`member.read`, `role.manage`, …) from bootstrap `data.permissions`.
- Clients must not treat the literal `"authenticated"` as a grantable or checkable permission key.

## Related gaps

| ID | Topic | Status |
|---|---|---|
| GAP-004 | SessionBootstrap on `GET /me` | Closed |
| GAP-005 | F01 error codes in error catalog | Closed |
| GAP-006 | CSRF on cookie mutations | Closed 2026-07-21 |
| GAP-007 | Permission grouping / registry layout | Closed 2026-07-21 |
| GAP-008 | MFA verify request body schema | Closed 2026-07-21 |
