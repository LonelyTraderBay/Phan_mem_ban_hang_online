# @ai-sales/test-utils

MSW handlers generated from the OpenAPI contract, node/browser MSW setup, and test data
factories (FE-F00-009). The README is the source of truth — read it before writing tests that hit
the network layer; it documents which operations the generator skips, and the hand-written auth
overrides in `src/msw/authHandlers.ts` (`GET /me` returns the real session-bootstrap shape by
default; use `server.use(...)` per test to simulate anonymous/error cases).

Import `server`/`worker` via the dedicated subpaths (`@ai-sales/test-utils/msw/server` or
`/msw/browser`), not the main package entrypoint — they're deliberately excluded from the barrel
so environment-specific MSW code doesn't leak into the wrong bundle.

@README.md
