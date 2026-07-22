import { hasPermission, type RequestSecurityContext } from "@ai-sales/auth-context";

export class AuthorizationError extends Error {
  constructor(public readonly permission: string) {
    super("Permission denied.");
    this.name = "AuthorizationError";
  }
}

export class MissingSecurityContextError extends Error {
  constructor(public readonly header: string) {
    super(`Missing required security context header: ${header}`);
    this.name = "MissingSecurityContextError";
  }
}

export function requirePermission(ctx: RequestSecurityContext, permission: string): void {
  if (!hasPermission(ctx, permission)) {
    throw new AuthorizationError(permission);
  }
}

export function maskRestrictedFields<T extends Record<string, unknown>>(
  value: T,
  restrictedFields: readonly string[]
): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !restrictedFields.includes(key))) as Partial<T>;
}
