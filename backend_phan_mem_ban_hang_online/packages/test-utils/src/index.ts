import type { RequestSecurityContext } from "@ai-sales/auth-context";
import type { Money, UuidV7 } from "@ai-sales/domain-kernel";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import type { IdempotencyRequest, IdempotencyStore, ReserveOutcome } from "@ai-sales/idempotency";

export function createTestSecurityContext(
  overrides: Partial<RequestSecurityContext> = {}
): RequestSecurityContext {
  return {
    actorType: "user",
    actorId: parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1a"),
    tenantId: parseUuidV7("018f65fd-7c6b-7c2a-9c8f-46e0f7a1f0a1"),
    permissions: ["tenant.read"],
    tenantTimezone: "Asia/Bangkok",
    correlationId: "test-correlation-id",
    ...overrides
  };
}

export interface TenantIsolationFixture {
  readonly tenantA: RequestSecurityContext;
  readonly tenantB: RequestSecurityContext;
}

export function createTenantIsolationFixture(
  overrides: { readonly tenantA?: Partial<RequestSecurityContext>; readonly tenantB?: Partial<RequestSecurityContext> } = {}
): TenantIsolationFixture {
  return {
    tenantA: createTestSecurityContext({
      tenantId: parseUuidV7("018f65fd-7c6b-7c2a-9c8f-46e0f7a1f0a1"),
      actorId: parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1a"),
      correlationId: "tenant-a-corr",
      ...overrides.tenantA
    }),
    tenantB: createTestSecurityContext({
      tenantId: parseUuidV7("018f65fd-7c6c-7c2a-9c8f-46e0f7a1f0b2"),
      actorId: parseUuidV7("018f65fd-7c6d-7cc8-9f68-9f5f2c7b7c2b"),
      correlationId: "tenant-b-corr",
      ...overrides.tenantB
    })
  };
}

export async function assertCrossTenantDenied(
  action: () => Promise<unknown>
): Promise<void> {
  try {
    const result = await action();
    if (Array.isArray(result) && result.length === 0) {
      return;
    }
    if (result == null) {
      return;
    }
    throw new Error("Expected cross-tenant access to be denied (empty/null), but received a value.");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Expected cross-tenant")) {
      throw error;
    }
    // RLS / authorization errors are the deny path.
  }
}

export async function replayIdempotencyKey(
  store: IdempotencyStore,
  ctx: RequestSecurityContext,
  request: IdempotencyRequest,
  execute: () => Promise<{ resourceId?: string; responseStatus: number; responseBody: unknown }>
): Promise<{ readonly first: ReserveOutcome; readonly second: ReserveOutcome; readonly executions: number }> {
  let executions = 0;
  const first = await store.reserve(ctx, request);
  if (first.outcome === "acquired") {
    executions += 1;
    const response = await execute();
    await store.complete(ctx, request, response);
  }
  const second = await store.reserve(ctx, request);
  if (second.outcome === "acquired") {
    executions += 1;
    const response = await execute();
    await store.complete(ctx, request, response);
  }
  return { first, second, executions };
}

export function assertMoneyMinorUnits(value: Money, expectedMinor: bigint, currency: string): void {
  if (value.currency !== currency || value.minorUnits !== expectedMinor) {
    throw new Error(
      `Money mismatch: expected ${expectedMinor} ${currency}, got ${value.minorUnits} ${value.currency}`
    );
  }
}

export function testUuidV7(value: string): UuidV7 {
  return parseUuidV7(value);
}
