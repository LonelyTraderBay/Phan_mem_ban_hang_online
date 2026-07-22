---
ticket_id: BE-IMP-001
title: Import upload/job/staging schema
owner: Backend AI Agent
phase: P3
risk: high
status: done
---

# Business outcome

Import job + staging schema (`000014`) and `createImportJob` / `getImportJob`.

# Completion manifest

- Migration: `infra/migrations/000014_import_schema.sql` (`import_jobs`, `import_job_rows`, FORCE RLS)
- Application: `modules/catalog/src/application/import-jobs.ts` + in-memory repo
- Tests: covered in `import-jobs.test.ts` (BE-IMP-001 section)
- Known risks: in-memory until Postgres adapter
