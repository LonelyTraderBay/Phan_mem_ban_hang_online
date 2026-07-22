---
ticket_id: BE-IMP-002
title: Parser, encoding/file limits, mapping detection
owner: Backend AI Agent
phase: P3
risk: medium
status: done
---

# Business outcome

CSV parse (UTF-8, reject NUL), header mapping detection, `analyzeImport`.

# Completion manifest

- `parseCsvStaging` / `analyzeImport` → status `mapped`, staged rows
- Error: `IMPORT_FILE_INVALID`
- Tests: BE-IMP-002 section in `import-jobs.test.ts`
