# FE-W4-W5 — Orders / AI / F09 gap / Super Admin / F10

## Preflight

- Mode C dual-track; design READY-MOCK only; no invent OpenAPI fields.
- Metric catalog: resolved — backend v1 catalog synced via `pnpm contracts:sync`.

## Done

### Wave 4
- `features/orders` list/detail + Money via `@ai-sales/domain` + packing-slip preview via `@ai-sales/printing`
- `features/ai` settings/logs/blocked
- MSW `orderAiHandlers`
- Route manifest wired (placeholders removed for orders/ai/reports/billing)

### Wave 5
- Dashboard + Reports render catalog ids/labels with READY-MOCK values
- `contracts/metrics/metric-catalog.yaml` is synced from backend
- Super Admin tenants uses a thin `GET /api/v1/super-admin/tenants` fetch with EmptyState fallback
- Windows F10: login CTA opens the local system-browser URL; native vault/capability work remains ADR-FE-014 scope

## Verify

- `pnpm --filter @ai-sales/web-admin typecheck`
- `pnpm --filter @ai-sales/super-admin typecheck`
- `pnpm --filter @ai-sales/windows-client typecheck`
