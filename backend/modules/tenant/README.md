# Tenant module

## Purpose

Tenant provisioning, settings, membership, roles/permissions, invitations, support grants.

## Owned data

See `docs/data/data-dictionary.md` and `docs/data/identity-migration-design.md`.

Primary tables: `tenants`, `tenant_memberships`, `roles`, `permissions`, `role_permissions`,
`membership_roles`, `invitations`, `support_access_grants`.

## OpenAPI tags

Tenant, Members, Roles

## Task IDs

`BE-IDN-*` — tickets in `docs/tickets/`. Test matrix: `docs/tickets/BE-IDN-test-matrix.md`.

## Recommended ticket order

| Order | Ticket | Notes |
|---|---|---|
| 1 | **BE-IDN-001** | Shared schema (identity + tenant tables) — owns migration |
| 2 | BE-IDN-002 | Tenant provision + default roles + owner invitation |
| 3 | BE-IDN-010 | Member invite / accept / suspend / revoke |
| 4 | BE-IDN-011 | Role/permission APIs (`role.manage`, not `role.write`) |
| 5 | BE-IDN-012 | Field-level authorization utilities |
| 6 | BE-IDN-013 | Audit list/export (permission + redaction) |
| 7 | BE-IDN-014 | Support access grant baseline |
| 8 | BE-IDN-015 | Aggregate security suite |

Auth/session tickets (003–009) are owned by `modules/identity` but tenant switch (009) and
membership checks couple tightly here.

Permission clarifications: `docs/collaboration/gap-003-f01-slice.md`.

## Agent read order

1. This README
2. `docs/data/identity-migration-design.md`
3. `docs/tickets/BE-IDN-002.md` (after 001)
4. `pnpm agent:contract-slice --tag Members` / `--tag Roles`
5. Relevant blueprint section via `docs/ai/blueprint-index/05-identity-auth.md`
