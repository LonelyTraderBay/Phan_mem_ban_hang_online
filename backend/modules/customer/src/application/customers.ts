import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import { applyFieldPolicies } from "@ai-sales/security";

/**
 * BE-CUS-002 — Customer CRUD/search/PII field masking.
 * In-memory until Postgres adapter; PII stored as plaintext in process memory only
 * (envelope encryption deferred — see ticket completion notes).
 */

export type CustomerStatus = "active" | "merged" | "anonymized";

export type CustomerErrorCode =
  | "VALIDATION_FAILED"
  | "INSUFFICIENT_PERMISSION"
  | "RESOURCE_NOT_FOUND"
  | "RESOURCE_VERSION_MISMATCH"
  | "IDEMPOTENCY_KEY_REQUIRED";

export class CustomerError extends Error {
  constructor(
    message: string,
    readonly code: CustomerErrorCode
  ) {
    super(message);
    this.name = "CustomerError";
  }
}

export interface CustomerResource {
  readonly id: string;
  readonly tenant_id: string;
  readonly display_name: string | null;
  readonly primary_email: string | null;
  readonly primary_phone: string | null;
  readonly status: CustomerStatus;
  readonly tags: readonly string[];
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface CustomerRepository {
  listCustomers(tenantId: string): Promise<readonly CustomerResource[]>;
  getCustomer(args: { readonly tenantId: string; readonly customerId: string }): Promise<CustomerResource | null>;
  createCustomer(args: {
    readonly tenantId: string;
    readonly customerId: UuidV7;
    readonly displayName: string | null;
    readonly primaryEmail: string | null;
    readonly primaryPhone: string | null;
    readonly tags: readonly string[];
  }): Promise<CustomerResource>;
  updateCustomer(args: {
    readonly tenantId: string;
    readonly customerId: string;
    readonly expectedVersion: number;
    readonly displayName: string | null | undefined;
    readonly primaryEmail: string | null | undefined;
    readonly primaryPhone: string | null | undefined;
  }): Promise<CustomerResource>;
  getIdempotentCreate(args: {
    readonly tenantId: string;
    readonly idempotencyKey: string;
  }): Promise<CustomerResource | null>;
  rememberIdempotentCreate(args: {
    readonly tenantId: string;
    readonly idempotencyKey: string;
    readonly customer: CustomerResource;
  }): Promise<void>;
}

export function requireCustomerPermission(
  actorPermissions: readonly string[],
  permission: "customer.read" | "customer.write"
): void {
  if (!actorPermissions.includes(permission)) {
    throw new CustomerError("Permission denied.", "INSUFFICIENT_PERMISSION");
  }
}

/** Build API payload omitting PII keys when actor lacks customer.pii.read. */
export function toCustomerResponseData(
  customer: CustomerResource,
  actorPermissions: readonly string[]
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: customer.id,
    tenant_id: customer.tenant_id,
    display_name: customer.display_name,
    status: customer.status,
    tags: [...customer.tags],
    version: customer.version,
    created_at: customer.created_at,
    updated_at: customer.updated_at,
    primary_email: customer.primary_email,
    primary_phone: customer.primary_phone
  };
  return applyFieldPolicies(base, actorPermissions) as Record<string, unknown>;
}

function normalizeEmail(email: string | null | undefined): string | null {
  if (email == null) return null;
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return null;
  if (!trimmed.includes("@") || trimmed.length > 320) {
    throw new CustomerError("Invalid email.", "VALIDATION_FAILED");
  }
  return trimmed;
}

function normalizePhone(phone: string | null | undefined): string | null {
  if (phone == null) return null;
  const trimmed = phone.trim();
  if (!trimmed) return null;
  if (trimmed.length > 32) {
    throw new CustomerError("Invalid phone.", "VALIDATION_FAILED");
  }
  return trimmed;
}

function normalizeDisplayName(name: string | null | undefined): string | null {
  if (name == null) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (trimmed.length > 300) {
    throw new CustomerError("display_name too long.", "VALIDATION_FAILED");
  }
  return trimmed;
}

export async function listCustomers(options: {
  readonly repo: CustomerRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
}): Promise<{
  readonly data: Record<string, unknown>[];
  readonly page_info: { readonly next_cursor: null; readonly has_more: false };
  readonly meta: Record<string, never>;
}> {
  requireCustomerPermission(options.actorPermissions, "customer.read");
  const rows = await options.repo.listCustomers(options.tenantId);
  return {
    data: rows.map((c) => toCustomerResponseData(c, options.actorPermissions)),
    page_info: { next_cursor: null, has_more: false },
    meta: {}
  };
}

export async function getCustomer(options: {
  readonly repo: CustomerRepository;
  readonly tenantId: string;
  readonly customerId: string;
  readonly actorPermissions: readonly string[];
}): Promise<{
  readonly data: Record<string, unknown>;
  readonly meta: Record<string, never>;
  readonly version: number;
}> {
  requireCustomerPermission(options.actorPermissions, "customer.read");
  const row = await options.repo.getCustomer({
    tenantId: options.tenantId,
    customerId: options.customerId
  });
  if (!row) {
    throw new CustomerError("Customer not found.", "RESOURCE_NOT_FOUND");
  }
  return {
    data: toCustomerResponseData(row, options.actorPermissions),
    meta: {},
    version: row.version
  };
}

export async function createCustomer(options: {
  readonly repo: CustomerRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly displayName?: string | null;
  readonly primaryEmail?: string | null;
  readonly primaryPhone?: string | null;
  readonly tags?: readonly string[] | null;
}): Promise<{
  readonly data: Record<string, unknown>;
  readonly meta: Record<string, never>;
  readonly version: number;
}> {
  requireCustomerPermission(options.actorPermissions, "customer.write");
  if (!options.idempotencyKey?.trim()) {
    throw new CustomerError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const key = options.idempotencyKey.trim();
  const existing = await options.repo.getIdempotentCreate({
    tenantId: options.tenantId,
    idempotencyKey: key
  });
  if (existing) {
    return {
      data: toCustomerResponseData(existing, options.actorPermissions),
      meta: {},
      version: existing.version
    };
  }

  const customer = await options.repo.createCustomer({
    tenantId: options.tenantId,
    customerId: generateUuidV7(),
    displayName: normalizeDisplayName(options.displayName),
    primaryEmail: normalizeEmail(options.primaryEmail),
    primaryPhone: normalizePhone(options.primaryPhone),
    tags: options.tags?.filter((t) => t.trim().length > 0) ?? []
  });
  await options.repo.rememberIdempotentCreate({
    tenantId: options.tenantId,
    idempotencyKey: key,
    customer
  });
  return {
    data: toCustomerResponseData(customer, options.actorPermissions),
    meta: {},
    version: customer.version
  };
}

export async function updateCustomer(options: {
  readonly repo: CustomerRepository;
  readonly tenantId: string;
  readonly customerId: string;
  readonly actorPermissions: readonly string[];
  readonly expectedVersion: number;
  readonly displayName?: string | null;
  readonly primaryEmail?: string | null;
  readonly primaryPhone?: string | null;
}): Promise<{
  readonly data: Record<string, unknown>;
  readonly meta: Record<string, never>;
  readonly version: number;
}> {
  requireCustomerPermission(options.actorPermissions, "customer.write");
  if (!Number.isInteger(options.expectedVersion) || options.expectedVersion < 1) {
    throw new CustomerError("expected_version required.", "VALIDATION_FAILED");
  }
  const customer = await options.repo.updateCustomer({
    tenantId: options.tenantId,
    customerId: options.customerId,
    expectedVersion: options.expectedVersion,
    displayName:
      options.displayName === undefined ? undefined : normalizeDisplayName(options.displayName),
    primaryEmail:
      options.primaryEmail === undefined ? undefined : normalizeEmail(options.primaryEmail),
    primaryPhone:
      options.primaryPhone === undefined ? undefined : normalizePhone(options.primaryPhone)
  });
  return {
    data: toCustomerResponseData(customer, options.actorPermissions),
    meta: {},
    version: customer.version
  };
}

export function formatEtag(version: number): string {
  return `"v${version}"`;
}

export function parseIfMatchVersion(ifMatch: string | undefined): number | null {
  if (!ifMatch?.trim()) return null;
  const m = /^"v(\d+)"$/.exec(ifMatch.trim());
  if (!m) return null;
  return Number(m[1]);
}
