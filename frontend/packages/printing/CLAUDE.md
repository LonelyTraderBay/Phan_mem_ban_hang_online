# @ai-sales/printing

PDF preview/download/native-print adapter. PDFs are generated **server-side and immutable**
(ADR-FE-015 — "no font/layout drift") — this package never renders a PDF client-side and never
knows about API paths; it only previews/downloads/prints a signed URL the caller already fetched
via `@ai-sales/api-client`.

- Depends only on `@ai-sales/platform` (for `PrintAdapter`) — no PDF-rendering library at all,
  consistent with never rendering client-side.
- `createNativePrintAdapter` exists but is a forward-looking stub — the real desktop native-print
  implementation is added once `apps/windows-client` needs it (F10). Don't build it out further
  without that context.
- No test script — only `typecheck`/`lint`. No README.
