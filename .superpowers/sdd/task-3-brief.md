# Task 3 brief — Update remaining long-name path strings

**Work from:** `c:\Users\C-PC\Documents\Phan_mem_ban_hang_online`
**Do NOT commit**

## Global Constraints
- Use short names `backend/` and `frontend/` only
- Do not refactor apps/packages beyond path string updates listed below
- Do not hand-edit frontend/contracts content except incidental sync already done

## Files to modify

### 1. README.md (umbrella root)
- Replace freeze path that still uses long backend name with:
  `backend/docs/enterprise-freeze/FULL_PRODUCT_DOC_FREEZE.md`
- Ensure this section exists near the top (after title / team model). Add if missing:

```markdown
## Workspace layout (canonical)

One git repository (umbrella). Two independent pnpm workspaces — do not mix code across them:

| Path | Owner | Contents |
|------|-------|----------|
| `backend/` | Backend AI Agent | NestJS/FastAPI apps, modules, infra, `backend_doc/`, BE docs |
| `frontend/` | Frontend AI Agent | Web/desktop apps, UI packages, synced `contracts/`, FE docs |

Contract source of truth lives under `backend/`. Frontend refreshes copies with `pnpm -C frontend contracts:sync`.
```

### 2. frontend/CLAUDE.md
Replace long-name freeze + sync lines with:

```markdown
- Canonical **what AI may code now** gate (sibling backend):
  `backend/docs/enterprise-freeze/FULL_PRODUCT_DOC_FREEZE.md` — **PASS
  (2026-07-22)**. Follow `backend/docs/readiness/ENTERPRISE_DOC_GATE.md`: kickoff **BE-IDN-001**, then FE F01
  MSW/READY-MOCK; no phase jumping. Mirror: `docs/enterprise-freeze/FE_FREEZE_CHECKLIST.md`.
  Sync contracts with `pnpm contracts:sync` (resolves sibling `../backend`; override with
  `BACKEND_CONTRACTS_ROOT` only in CI).
```

### 3. backend/docs/enterprise-freeze/FULL_PRODUCT_DOC_FREEZE.md
Replace FE sync bullet with:
```markdown
- FE `pnpm contracts:sync` + `contracts:validate` pass (sibling `backend/`; CI may set `BACKEND_CONTRACTS_ROOT`)
```

### 4. backend/docs/enterprise-freeze/waves/W6_fe_design_specs.md
Replace tool path with:
```markdown
- Tool: `frontend/tools/w6-freeze-design-specs.mjs`
```

### 5. frontend/tools/w6-freeze-design-specs.mjs
Change beInventory to:
```javascript
const beInventory = path.resolve(
  root,
  "../backend/docs/enterprise-freeze/inventory/fe_screen_inventory.csv",
);
```

### 6. Grep leftover live paths
```powershell
rg -n "backend_phan_mem_ban_hang_online|frontend_phan_mem_ban_hang_online" --glob "!**/node_modules/**" --glob "!**/.git/**" --glob "!**/.superpowers/**"
```
Expected: no live path references in tracked docs/scripts. Historical mentions inside design/plan "was …" prose may remain; prefer updating those to past tense if easy. Spec/plan under backend/docs/superpowers may mention old names as history — OK if clearly past tense.

## Report
Write `.superpowers/sdd/task-3-report.md`. Include grep results.
