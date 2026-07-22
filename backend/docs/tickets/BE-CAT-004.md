---
ticket_id: BE-CAT-004
title: Private media upload/scan/signed URL flow
owner: Backend AI Agent
phase: P3
risk: medium
status: done
---

# Business outcome

Private media upload intent → attach to product → sync scan stub → signed download URL.

Primary paths: `modules/catalog/` (`application/media.ts`).

# Actor and use case

1. `POST /media/uploads` (`createMediaUploadIntent`) with `catalog.write` + Idempotency-Key  
   → JobResponse: `job_id`=upload_id, `status_url`=signed PUT URL (15 min TTL).
2. Client uploads bytes to signed URL (in-memory: attach implies bytes received).
3. `POST /products/{id}/media` (`attachProductMedia`) attaches to first active variant, scan→`clean`.
4. `getSignedMediaDownloadUrl` only when `scan_status=clean`.

# In scope / Out of scope

In scope:
- MIME allowlist (jpeg/png/webp/gif), 10 MiB cap
- Errors: `UNSUPPORTED_MEDIA_TYPE`, `REQUEST_TOO_LARGE`
- Idempotent intent + attach
- Tenant isolation

Out of scope:
- Real S3/MinIO adapter
- Async malware worker
- Inventing OpenAPI fields for signed download GET

# Contract

- OpenAPI: `createMediaUploadIntent`, `attachProductMedia` (frozen)
- Field reuse on CatalogResource: name=filename, description=alt_text, brand=media_type, category_id=variant_id
- JobResponse `status_url` = upload URL

# Persistence

- Uses `app.product_media` shape from `000012` (in-memory)
- Migration: none

# Acceptance criteria

- [x] Happy path intent → attach → signed download
- [x] MIME/size validation codes
- [x] Permission + tenant isolation
- [x] Idempotency
- [ ] Staging smoke when phase reaches staging

# Completion manifest

- Contracts changed: none
- Migration: none
- Tests: `pnpm exec vitest run modules/catalog` — 24/24
- Known risks: product-scoped API vs variant-scoped table (attach picks first active variant); real object storage TBD
