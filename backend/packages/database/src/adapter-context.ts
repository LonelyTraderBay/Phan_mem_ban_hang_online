import type { RequestSecurityContext } from "@ai-sales/auth-context";
import { parseUuidV7 } from "@ai-sales/domain-kernel";

export function adapterSecurityContext(
  tenantId: string,
  actorId?: string,
  correlationId?: string
): RequestSecurityContext {
  return {
    actorType: "user",
    actorId: parseUuidV7(actorId ?? "018f0000-0000-7000-8000-000000000001"),
    tenantId: parseUuidV7(tenantId),
    permissions: [],
    tenantTimezone: "UTC",
    correlationId: correlationId ?? "postgres-adapter"
  };
}
