# Local Postgres bootstrap (Windows native) — AI Sales OS

Run once after installing PostgreSQL 17 (or when recreating `ai_sales`).

Requires: `psql` on PATH or under `C:\Program Files\PostgreSQL\17\bin`.

```powershell
$env:Path = "C:\Program Files\PostgreSQL\17\bin;" + $env:Path
# Assumes trust or known postgres password for bootstrap; then:
# 1) CREATE ROLE app_schema_owner LOGIN PASSWORD 'change-me-local-only' SUPERUSER BYPASSRLS;
# 2) CREATE DATABASE ai_sales OWNER app_schema_owner;
# 3) In ai_sales: CREATE EXTENSION citext/pgcrypto; ALTER EXTENSION citext SET SCHEMA app;
# 4) DATABASE_URL=... node tools/migrate.mjs
```

Prefer credentials in `.env.local` (gitignored). Do not commit passwords.
