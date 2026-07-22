# @ai-sales/config

Typed runtime config: loads and validates `/runtime-config.json` (spec 5.2).

- `src/schema.ts` is **public config only** — never add secrets, tokens, or credentials here
  (spec 5.2's explicit exclusion list).
- `loadRuntimeConfig()` never throws. On an invalid/unfetchable config it returns
  `{ ok: false }`; the caller (app bootstrap) must render `FatalConfigurationScreen` rather than
  continuing with a partial or unvalidated config — don't "handle" the false case by falling back
  to defaults.
- Validated with `zod`. No README; constraints live as inline comments in `schema.ts` and
  `loadRuntimeConfig.ts`.
