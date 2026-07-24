# Task P1.1 Report — Sync data-dictionary / ERD for migrated tables

**Date:** 2026-07-24  
**Working directory:** `backend/`  
**Commits:** none (per Human Owner rule)

## Objective

Add **Done** rows to the data dictionary (and ERD / RLS catalog pointers) for 11 tables already migrated in P0.1 sync (34/34) but missing from the index — so agents do not re-create existing tables.

## Files modified

| File | Change |
|------|--------|
| `backend/docs/data/data-dictionary.md` | +11 table rows; summary counts 90 → **101** (97 Done / 4 Not started) |
| `backend/docs/data/ERD.md` | “Also migrated (not drawn)” notes in §1, §3–§8 |
| `backend/docs/data/rls-intent-catalog.md` | New §H — ephemeral pre-auth / user-scoped GLOBAL (no tenant RLS) |
| `backend/docs/release/HO-STAGING-CHECKLIST.md` | Optional polish: stale **33/33** → **34/34** (A0 header, row 1, row 4a local) |

## Tables added (all **Done**, class per brief)

| Table | Class | Section | Migration |
|-------|-------|---------|-----------|
| `oidc_login_states` | SYSTEM_INTERNAL / ephemeral | Identity | `000006` |
| `password_reset_tokens` | GLOBAL (user-scoped) | Identity | `000009` |
| `mfa_challenges` | GLOBAL (user-scoped) | Identity | `000009` |
| `media_upload_intents` | TENANT_OWNED | Catalog | `000028` |
| `inventory_reconciliation_jobs` | TENANT_OWNED | Inventory | `000029` |
| `ai_suggestions` | TENANT_OWNED | Knowledge / AI | `000024` |
| `tenant_ai_controls` | TENANT_OWNED | Knowledge / AI | `000024` |
| `channel_oauth_states` | TENANT_OWNED | Channel | `000017` |
| `payment_attempts` | TENANT_OWNED | Order / Payment | `000020` |
| `projection_watermarks` | TENANT_OWNED | Analytics | `000022` |
| `report_exports` | TENANT_OWNED | Analytics | `000022` (+ idempotency index `000024`) |

## Summary count delta

| Class | Before | After |
|-------|-------:|------:|
| GLOBAL | 14 | **16** |
| TENANT_OWNED (incl. ledgers) | 68 | **76** |
| SYSTEM_INTERNAL | 1 | **2** |
| **Total indexed** | **90** | **101** |
| **Done** | 86 | **97** |

Remaining **Not started** (unchanged): `shipping_labels`, `support_tickets`, `job_runs`, `audit_logs`.

## Self-check (grep dictionary)

Each table name appears exactly once with **Done**:

- [x] `oidc_login_states`
- [x] `password_reset_tokens`
- [x] `mfa_challenges`
- [x] `channel_oauth_states`
- [x] `payment_attempts`
- [x] `projection_watermarks`
- [x] `report_exports`
- [x] `ai_suggestions`
- [x] `tenant_ai_controls`
- [x] `media_upload_intents`
- [x] `inventory_reconciliation_jobs`

## Failures / blockers

None.

## Concerns / follow-ups

- `backend/docs/enterprise-freeze/inventory/data_dictionary_coverage.csv` was **not** updated (out of brief scope); may drift until a separate inventory sync.
- ERD diagrams still omit these tables by design; only status notes added.

## Status

**DONE**
