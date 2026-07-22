# @ai-sales/test-utils

MSW handlers generated from `contracts/openapi/*.yaml`, node/browser MSW setup, and test data
factories (FE-F00-009).

## MSW fixtures are honestly generic

At this stage of the backend contract, ~95% of operations respond with one of two generic
envelope schemas (`GenericListResponse` / `GenericDataResponse`) rather than real per-resource
schemas (confirmed by reading the contract directly — see `tooling/scripts/generate-msw-fixtures.mjs`).
Generated fixtures reflect that honestly: an empty list, or one placeholder resource with only
the fields the contract actually guarantees (`id`/`version`/`created_at`/`updated_at`). Nothing
here invents business field names (spec 2.2).

21+ operations are skipped because they have no 2xx response defined yet (async job endpoints) or
use a schema this generator doesn't emit fixtures for (`AuthResponse`, `SessionBootstrapResponse`,
`ReservationResponse`) — see the generator's console output for the full list. These need a
hand-written handler; they are not silently missing.

## Hand-written auth overrides (`src/msw/authHandlers.ts`)

The exported `handlers` array is `[...authHandlers, ...generatedHandlers]` — MSW resolves to the
first matching handler, so the hand-written entries shadow any generated stubs:

- `GET /me` — OpenAPI declares `SessionBootstrapResponse`; generator still skips it. Override
  returns `buildSessionBootstrap()` so `bootstrapSession()` succeeds
  (`packages/auth/src/tests/bootstrap.test.ts`).
- `POST /auth/login` and `POST /invitations/accept` — `AuthResponse`; `access_token: null`
  (ADR-FE-013 HttpOnly cookie).

To override per test (e.g. an anonymous 401 for `/me`), prepend with `server.use(...)` — runtime
handlers take precedence over the defaults:

```ts
import { http, HttpResponse } from "msw";
import { server } from "@ai-sales/test-utils/msw/server";

server.use(http.get("*/api/me", () => new HttpResponse(null, { status: 401 })));
```

Refresh/logout/password-reset may still use generated generic stubs where that remains the
published contract. `verifyMfa` 2xx is now `AuthResponse` (also generator-skipped — add a
hand override when MFA UI tests need it).

## Usage

```ts
// Vitest setup file
import { server } from "@ai-sales/test-utils/msw/server";
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

```ts
// Storybook preview / local dev without a backend
import { worker } from "@ai-sales/test-utils/msw/browser";
await worker.start();
```

Regenerate fixtures after `pnpm contracts:sync`: `pnpm --filter @ai-sales/test-utils run codegen`.
