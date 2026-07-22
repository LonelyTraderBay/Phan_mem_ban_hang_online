import type { UuidV7 } from "@ai-sales/domain-kernel";

export type ActorType = "user" | "service" | "ai" | "system" | "support";

export interface RequestSecurityContext {
  readonly actorType: ActorType;
  readonly actorId: UuidV7;
  readonly tenantId: UuidV7;
  readonly membershipId?: UuidV7;
  readonly permissions: readonly string[];
  readonly tenantTimezone: string;
  readonly correlationId: string;
  readonly supportGrantId?: UuidV7;
}

export function hasPermission(ctx: RequestSecurityContext, permission: string): boolean {
  return ctx.permissions.includes(permission);
}
