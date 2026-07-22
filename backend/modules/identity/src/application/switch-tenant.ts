import { generateUuidV7 } from "@ai-sales/domain-kernel";
import {
  assertCsrfDoubleSubmit,
  OidcAuthError,
  sha256Hex,
  type SessionAuthRepository,
  type SessionBootstrap
} from "./oidc-types.js";

export async function switchTenant(options: {
  readonly sessions: SessionAuthRepository;
  readonly presentedRefreshToken: string | undefined;
  readonly csrfCookie: string | undefined;
  readonly csrfHeader: string | undefined;
  readonly tenantId: string;
  readonly correlationId?: string | null;
}): Promise<{ readonly data: SessionBootstrap; readonly meta: Record<string, never> }> {
  assertCsrfDoubleSubmit(options.csrfCookie, options.csrfHeader);

  const presented = options.presentedRefreshToken?.trim();
  if (!presented) {
    throw new OidcAuthError("Session required.", "AUTH_UNAUTHORIZED");
  }

  const tenantId = options.tenantId?.trim();
  if (!tenantId || !/^[0-9a-fA-F-]{36}$/.test(tenantId)) {
    throw new OidcAuthError("Invalid tenant_id.", "VALIDATION_FAILED");
  }

  const result = await options.sessions.switchTenant({
    presentedTokenHash: sha256Hex(presented),
    targetTenantId: tenantId,
    auditId: generateUuidV7(),
    correlationId: options.correlationId ?? null
  });

  if (result.outcome !== "ok") {
    if (result.outcome === "unauthorized") {
      throw new OidcAuthError("Session invalid or expired.", "AUTH_UNAUTHORIZED");
    }
    if (result.outcome === "tenant_context_invalid") {
      throw new OidcAuthError("Tenant context invalid.", "TENANT_CONTEXT_INVALID");
    }
    if (result.outcome === "membership_inactive") {
      throw new OidcAuthError("Membership inactive.", "MEMBERSHIP_INACTIVE");
    }
    throw new OidcAuthError("Tenant inactive.", "TENANT_INACTIVE");
  }

  return { data: result.bootstrap, meta: {} };
}
