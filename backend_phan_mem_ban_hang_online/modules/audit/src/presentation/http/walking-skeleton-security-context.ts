import { type ActorType, type RequestSecurityContext } from "@ai-sales/auth-context";
import { DomainInvariantError, parseUuidV7 } from "@ai-sales/domain-kernel";
import { MissingSecurityContextError } from "@ai-sales/security";

type HeaderBag = Record<string, string | string[] | undefined>;

function headerValue(headers: HeaderBag, name: string): string {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new MissingSecurityContextError(name);
  }
  return raw.trim();
}

/**
 * Walking-skeleton only: derives RequestSecurityContext from internal headers.
 * Not for production JWT/OIDC auth — Identity tickets replace this with
 * server-established session context. Do not re-export from @ai-sales/security.
 */
export function securityContextFromHeaders(
  headers: HeaderBag,
  overrides: Partial<Pick<RequestSecurityContext, "actorType" | "tenantTimezone">> = {}
): RequestSecurityContext {
  try {
    const permissionsHeader = headerValue(headers, "x-permissions");
    const actorType = (overrides.actorType ?? "user") as ActorType;
    return {
      actorType,
      actorId: parseUuidV7(headerValue(headers, "x-actor-id")),
      tenantId: parseUuidV7(headerValue(headers, "x-tenant-id")),
      permissions: permissionsHeader.split(",").map((p) => p.trim()).filter(Boolean),
      tenantTimezone: overrides.tenantTimezone ?? "UTC",
      correlationId: headerValue(headers, "x-correlation-id")
    };
  } catch (error) {
    if (error instanceof DomainInvariantError) {
      throw new MissingSecurityContextError(error.message);
    }
    throw error;
  }
}
