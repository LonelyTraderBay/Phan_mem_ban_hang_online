export type TenantStatus = "active" | "suspended" | "closed";

export type TenantSettingsErrorCode =
  | "VALIDATION_FAILED"
  | "INSUFFICIENT_PERMISSION"
  | "RESOURCE_NOT_FOUND"
  | "RESOURCE_VERSION_MISMATCH";

export class TenantSettingsError extends Error {
  constructor(
    message: string,
    readonly code: TenantSettingsErrorCode
  ) {
    super(message);
    this.name = "TenantSettingsError";
  }
}

export interface TenantResource {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: TenantStatus;
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface TenantSettingsRepository {
  getCurrentTenant(tenantId: string): Promise<TenantResource | null>;
  updateCurrentTenant(args: {
    readonly tenantId: string;
    readonly expectedVersion: number;
    readonly name: string | null | undefined;
  }): Promise<TenantResource>;
}

function requireTenantPermission(actorPermissions: readonly string[], permission: string): void {
  if (!actorPermissions.includes(permission)) {
    throw new TenantSettingsError("Permission denied.", "INSUFFICIENT_PERMISSION");
  }
}

function normalizeName(name: string | null | undefined): string | null | undefined {
  if (name == null) return name;
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 200) {
    throw new TenantSettingsError("Invalid tenant name.", "VALIDATION_FAILED");
  }
  return trimmed;
}

function requireExpectedVersion(expectedVersion: number): void {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw new TenantSettingsError("expected_version required.", "VALIDATION_FAILED");
  }
}

export async function getCurrentTenant(options: {
  readonly repo: TenantSettingsRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
}): Promise<{ readonly data: TenantResource; readonly meta: Record<string, never> }> {
  requireTenantPermission(options.actorPermissions, "tenant.read");
  const tenant = await options.repo.getCurrentTenant(options.tenantId);
  if (!tenant) {
    throw new TenantSettingsError("Tenant not found.", "RESOURCE_NOT_FOUND");
  }
  return { data: tenant, meta: {} };
}

export async function updateCurrentTenant(options: {
  readonly repo: TenantSettingsRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly expectedVersion: number;
  readonly name?: string | null;
}): Promise<{ readonly data: TenantResource; readonly meta: Record<string, never> }> {
  requireTenantPermission(options.actorPermissions, "tenant.update");
  requireExpectedVersion(options.expectedVersion);
  const tenant = await options.repo.updateCurrentTenant({
    tenantId: options.tenantId,
    expectedVersion: options.expectedVersion,
    name: normalizeName(options.name)
  });
  return { data: tenant, meta: {} };
}
