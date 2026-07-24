# Task P1.1 — Thêm hàng dictionary cho bảng đã có

**Phase:** P1 — Đồng bộ data-dictionary / ERD (doc-only)  
**Plan:** `backend/docs/superpowers/plans/2026-07-24-db-schema-completion.md`

**Mục tiêu:** Agent không tạo trùng bảng đã migrate.

**Files:**
- Modify: `backend/docs/data/data-dictionary.md`
- Modify: `backend/docs/data/ERD.md` (chỉ note / dòng status nếu cần)
- Modify: `backend/docs/data/rls-intent-catalog.md` nếu thiếu template pointer

## Bảng tối thiểu phải có hàng **Done** (class đúng)

| Table | Class | Migration |
|-------|-------|-----------|
| `oidc_login_states` | SYSTEM_INTERNAL / ephemeral | `000006` |
| `password_reset_tokens` | GLOBAL (user-scoped) | `000009` |
| `mfa_challenges` | GLOBAL (user-scoped) | `000009` |
| `channel_oauth_states` | TENANT_OWNED | `000017` |
| `payment_attempts` | TENANT_OWNED | `000020` |
| `projection_watermarks` | TENANT_OWNED | `000022` |
| `report_exports` | TENANT_OWNED | `000022` |
| `ai_suggestions` | TENANT_OWNED | `000024` |
| `tenant_ai_controls` | TENANT_OWNED | `000024` |
| `media_upload_intents` | TENANT_OWNED | `000028` |
| `inventory_reconciliation_jobs` | TENANT_OWNED | `000029` |

## Steps

- [ ] Insert rows into appropriate sections of `data-dictionary.md`; update summary counts at end of file.
- [ ] ERD: add “also migrated” notes if diagrams omit these.
- [ ] Self-check: grep dictionary for each table name + Done status.
- [ ] Optional polish from P0.1 review Minor: in `HO-STAGING-CHECKLIST.md`, refresh stale **33** → **34** where it contradicts P0.1 evidence (MIGRATE counts / row 4a local). Do not touch secrets.

**Done khi:** 11 bảng drift có hàng Done; summary counts khớp thực tế.

## Controller resolutions

- Doc-only (plus optional checklist count polish). No SQL migrations.
- Do NOT git commit.
- Do NOT invent new tables or change class of existing Done rows incorrectly.
- Work from: `C:/Users/C-PC/Documents/Phan_mem_ban_hang_online/backend`
