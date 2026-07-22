# ADR-FE-015: PDF generation

**Status:** Accepted

## Context

Packing slips and similar printable documents need consistent, auditable output — client-side PDF
generation (e.g. via a browser print-to-PDF or a JS PDF library) is sensitive to font
availability, layout engine differences, and is hard to make byte-for-byte reproducible for audit.

## Decision

Packing-slip (and similar) PDFs are generated server-side and are immutable; the client only
previews/downloads/prints a signed URL.

## Consequences

- `packages/printing`'s `PdfPreviewAdapter` interface takes a `signedUrl` string, never renders a
  PDF client-side, and never knows about API request paths — the caller (a feature) fetches the
  signed URL via `@ai-sales/api-client` and hands it to this package.
- No native-print Tauri implementation exists yet (`createNativePrintAdapter` takes a
  `PrintAdapter` from `packages/platform`, whose Tauri-backed implementation lands with F10).
