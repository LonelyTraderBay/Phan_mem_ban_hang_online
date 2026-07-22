---
description: Run the full verification suite and summarize failures by check (contracts, lint, typecheck, test)
---

## Node/TS verification

!`pnpm verify`

## Next

1. If the diff touches `apps/ai-service/`, also run `pnpm test:py` yourself.
2. Summarize results grouped by step (`contracts:validate`, `lint`, `typecheck`, `test`,
   `test:py` if run):
   - ✅ passed steps — one line each, no output dump.
   - ❌ failed steps — the actual failing file/test/rule and a concrete next fix, not the raw
     log.

Do not paste raw command output back verbatim; extract only what's actionable.
