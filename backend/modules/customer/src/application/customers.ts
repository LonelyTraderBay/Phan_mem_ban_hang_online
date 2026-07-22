import { createHash } from "node:crypto";
import type { IdempotencyStore } from "@ai-sales/idempotency";
import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import { applyFieldPolicies } from "@ai-sales/security";
import { runCustomerIdempotent } from "./customer-idempotency.js";

/**
 * BE-CUS-002 — Customer CRUD/search/PII field masking.
 * BE-CUS-003 — Identity attach/dedupe (email/phone/external).
 * BE-CUS-004 — Merge preview / merge transaction / history.
 * In-memory until Postgres adapter; PII stored as plaintext in process memory only
 * (envelope encryption deferred — see ticket completion notes).
 */

export type CustomerStatus = "active" | "merged" | "anonymized";

export type CustomerIdentityType = "email" | "phone" | "external";

export type CustomerErrorCode =
  | "VALIDATION_FAILED"
  | "INSUFFICIENT_PERMISSION"
  | "RESOURCE_NOT_FOUND"
  | "RESOURCE_VERSION_MISMATCH"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "CUSTOMER_IDENTITY_CONFLICT"
  | "CUSTOMER_MERGE_CONFLICT";

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

export interface CustomerIdentityRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly customerId: string;
  readonly identityType: CustomerIdentityType;
  readonly normalizedValueHash: string;
  readonly externalId: string | null;
  readonly isPrimary: boolean;
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
  findIdentityByHash(args: {
    readonly tenantId: string;
    readonly identityType: CustomerIdentityType;
    readonly normalizedValueHash: string;
  }): Promise<CustomerIdentityRecord | null>;
  addIdentity(args: {
    readonly tenantId: string;
    readonly customerId: string;
    readonly identityId: UuidV7;
    readonly identityType: CustomerIdentityType;
    readonly normalizedValueHash: string;
    readonly externalId: string | null;
    readonly isPrimary: boolean;
  }): Promise<CustomerIdentityRecord>;
  getIdempotentIdentityAttach(args: {
    readonly tenantId: string;
    readonly idempotencyKey: string;
  }): Promise<CustomerResource | null>;
  rememberIdempotentIdentityAttach(args: {
    readonly tenantId: string;
    readonly idempotencyKey: string;
    readonly customer: CustomerResource;
  }): Promise<void>;
  getIdempotentMerge(args: {
    readonly tenantId: string;
    readonly idempotencyKey: string;
  }): Promise<CustomerResource | null>;
  rememberIdempotentMerge(args: {
    readonly tenantId: string;
    readonly idempotencyKey: string;
    readonly customer: CustomerResource;
  }): Promise<void>;
  /** Atomic merge: lock by id order, mark sources merged, move identities, history + outbox. */
  executeMerge(args: {
    readonly tenantId: string;
    readonly survivorId: string;
    readonly mergeIds: readonly string[];
    readonly actorId: string;
    readonly correlationId: string;
    readonly fieldResolution: Record<string, unknown>;
  }): Promise<CustomerResource>;
}

export function requireCustomerPermission(
  actorPermissions: readonly string[],
  permission: "customer.read" | "customer.write" | "customer.merge"
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
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly idempotency?: IdempotencyStore;
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
  return runCustomerIdempotent({
    idempotency: options.idempotency,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: "customer.create",
    key,
    loadCached: () =>
      options.repo.getIdempotentCreate({
        tenantId: options.tenantId,
        idempotencyKey: key
      }),
    rememberCached: (customer) =>
      options.repo.rememberIdempotentCreate({
        tenantId: options.tenantId,
        idempotencyKey: key,
        customer
      }),
    loadById: (customerId) =>
      options.repo.getCustomer({ tenantId: options.tenantId, customerId }),
    toResult: (customer) => ({
      data: toCustomerResponseData(customer, options.actorPermissions),
      meta: {},
      version: customer.version
    }),
    execute: async () => {
      const customer = await options.repo.createCustomer({
        tenantId: options.tenantId,
        customerId: generateUuidV7(),
        displayName: normalizeDisplayName(options.displayName),
        primaryEmail: normalizeEmail(options.primaryEmail),
        primaryPhone: normalizePhone(options.primaryPhone),
        tags: options.tags?.filter((t) => t.trim().length > 0) ?? []
      });
      return {
        customer,
        result: {
          data: toCustomerResponseData(customer, options.actorPermissions),
          meta: {},
          version: customer.version
        }
      };
    }
  });
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

export function hashNormalizedIdentity(normalized: string): string {
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

function parseIdentityType(raw: string | undefined): CustomerIdentityType {
  if (raw === "email" || raw === "phone" || raw === "external") return raw;
  throw new CustomerError("identity type must be email, phone, or external.", "VALIDATION_FAILED");
}

function normalizeIdentityValue(type: CustomerIdentityType, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new CustomerError("identity value required.", "VALIDATION_FAILED");
  }
  if (type === "email") {
    const email = normalizeEmail(trimmed);
    if (!email) throw new CustomerError("Invalid email identity.", "VALIDATION_FAILED");
    return email;
  }
  if (type === "phone") {
    const phone = normalizePhone(trimmed);
    if (!phone) throw new CustomerError("Invalid phone identity.", "VALIDATION_FAILED");
    return phone;
  }
  if (trimmed.length > 320) {
    throw new CustomerError("external identity too long.", "VALIDATION_FAILED");
  }
  return trimmed;
}

/** BE-CUS-003 — attach identity with tenant-scoped dedupe. */
export async function addCustomerIdentity(options: {
  readonly repo: CustomerRepository;
  readonly tenantId: string;
  readonly customerId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly idempotency?: IdempotencyStore;
  readonly type: string;
  readonly value: string;
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
  return runCustomerIdempotent({
    idempotency: options.idempotency,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: "customer.identity.attach",
    key,
    loadCached: () =>
      options.repo.getIdempotentIdentityAttach({
        tenantId: options.tenantId,
        idempotencyKey: key
      }),
    rememberCached: (customer) =>
      options.repo.rememberIdempotentIdentityAttach({
        tenantId: options.tenantId,
        idempotencyKey: key,
        customer
      }),
    loadById: (customerId) =>
      options.repo.getCustomer({ tenantId: options.tenantId, customerId }),
    toResult: (customer) => ({
      data: toCustomerResponseData(customer, options.actorPermissions),
      meta: {},
      version: customer.version
    }),
    execute: async () => {
      const customer = await options.repo.getCustomer({
        tenantId: options.tenantId,
        customerId: options.customerId
      });
      if (!customer || customer.status !== "active") {
        throw new CustomerError("Customer not found.", "RESOURCE_NOT_FOUND");
      }

      const identityType = parseIdentityType(options.type);
      const normalized = normalizeIdentityValue(identityType, options.value);
      const hash = hashNormalizedIdentity(normalized);

      const existing = await options.repo.findIdentityByHash({
        tenantId: options.tenantId,
        identityType,
        normalizedValueHash: hash
      });
      if (existing) {
        if (existing.customerId !== options.customerId) {
          throw new CustomerError(
            "Identity already attached to another customer.",
            "CUSTOMER_IDENTITY_CONFLICT"
          );
        }
        return {
          customer,
          result: {
            data: toCustomerResponseData(customer, options.actorPermissions),
            meta: {},
            version: customer.version
          }
        };
      }

      await options.repo.addIdentity({
        tenantId: options.tenantId,
        customerId: options.customerId,
        identityId: generateUuidV7(),
        identityType,
        normalizedValueHash: hash,
        externalId: identityType === "external" ? normalized : null,
        isPrimary: true
      });

      let updated = customer;
      if (identityType === "email" && !customer.primary_email) {
        updated = await options.repo.updateCustomer({
          tenantId: options.tenantId,
          customerId: options.customerId,
          expectedVersion: customer.version,
          displayName: undefined,
          primaryEmail: normalized,
          primaryPhone: undefined
        });
      } else if (identityType === "phone" && !customer.primary_phone) {
        updated = await options.repo.updateCustomer({
          tenantId: options.tenantId,
          customerId: options.customerId,
          expectedVersion: customer.version,
          displayName: undefined,
          primaryEmail: undefined,
          primaryPhone: normalized
        });
      }

      return {
        customer: updated,
        result: {
          data: toCustomerResponseData(updated, options.actorPermissions),
          meta: {},
          version: updated.version
        }
      };
    }
  });
}

/** Deterministic preview checksum — client must send the same token on merge. */
export function computeMergeConfirmationToken(
  survivorId: string,
  mergeIds: readonly string[]
): string {
  const uniqueSorted = [...new Set(mergeIds)].sort();
  const payload = `v1|${survivorId}|${uniqueSorted.join("|")}`;
  return createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 32);
}

function normalizeMergeIds(survivorId: string, mergeIds: readonly string[]): string[] {
  if (!survivorId?.trim()) {
    throw new CustomerError("survivor_id required.", "VALIDATION_FAILED");
  }
  if (!Array.isArray(mergeIds) || mergeIds.length < 1) {
    throw new CustomerError("merge_ids must contain at least one id.", "VALIDATION_FAILED");
  }
  const unique = [...new Set(mergeIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length !== mergeIds.length) {
    throw new CustomerError("merge_ids must be unique.", "VALIDATION_FAILED");
  }
  if (unique.includes(survivorId)) {
    throw new CustomerError("survivor_id cannot appear in merge_ids.", "VALIDATION_FAILED");
  }
  return unique;
}

async function loadActiveMergeSet(options: {
  readonly repo: CustomerRepository;
  readonly tenantId: string;
  readonly survivorId: string;
  readonly mergeIds: readonly string[];
}): Promise<{ survivor: CustomerResource; sources: CustomerResource[] }> {
  const survivor = await options.repo.getCustomer({
    tenantId: options.tenantId,
    customerId: options.survivorId
  });
  if (!survivor) {
    throw new CustomerError("Survivor customer not found.", "RESOURCE_NOT_FOUND");
  }
  if (survivor.status !== "active") {
    throw new CustomerError("Survivor is not mergeable.", "CUSTOMER_MERGE_CONFLICT");
  }

  const sources: CustomerResource[] = [];
  for (const id of options.mergeIds) {
    const row = await options.repo.getCustomer({
      tenantId: options.tenantId,
      customerId: id
    });
    if (!row) {
      throw new CustomerError("Merge source customer not found.", "RESOURCE_NOT_FOUND");
    }
    if (row.status !== "active") {
      throw new CustomerError("Merge source is not mergeable.", "CUSTOMER_MERGE_CONFLICT");
    }
    sources.push(row);
  }
  return { survivor, sources };
}

function buildFieldResolution(
  survivor: CustomerResource,
  sources: readonly CustomerResource[]
): Record<string, unknown> {
  const resolution: Record<string, unknown> = {
    policy: "survivor_wins_then_first_source",
    display_name: survivor.display_name,
    primary_email: survivor.primary_email,
    primary_phone: survivor.primary_phone,
    tags: [...survivor.tags]
  };
  for (const source of sources) {
    if (resolution.display_name == null && source.display_name != null) {
      resolution.display_name = source.display_name;
    }
    if (resolution.primary_email == null && source.primary_email != null) {
      resolution.primary_email = source.primary_email;
    }
    if (resolution.primary_phone == null && source.primary_phone != null) {
      resolution.primary_phone = source.primary_phone;
    }
    const tags = new Set([...(resolution.tags as string[]), ...source.tags]);
    resolution.tags = [...tags];
  }
  return resolution;
}

/**
 * BE-CUS-004 — validate merge set; no mutation. Returns survivor resource.
 * Clients must call `computeMergeConfirmationToken(survivor_id, merge_ids)` for merge.
 * (OpenAPI Meta is sealed — token is not returned in the response body.)
 */
export async function previewCustomerMerge(options: {
  readonly repo: CustomerRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly survivorId: string;
  readonly mergeIds: readonly string[];
}): Promise<{
  readonly data: Record<string, unknown>;
  readonly meta: Record<string, never>;
  readonly version: number;
}> {
  requireCustomerPermission(options.actorPermissions, "customer.merge");
  const mergeIds = normalizeMergeIds(options.survivorId, options.mergeIds);
  const { survivor, sources } = await loadActiveMergeSet({
    repo: options.repo,
    tenantId: options.tenantId,
    survivorId: options.survivorId,
    mergeIds
  });
  // Field resolution proves preview path is ready; identity uniqueness already at attach.
  void buildFieldResolution(survivor, sources);
  return {
    data: toCustomerResponseData(survivor, options.actorPermissions),
    meta: {},
    version: survivor.version
  };
}

/** BE-CUS-004 — idempotent merge transaction + history + outbox event. */
export async function mergeCustomers(options: {
  readonly repo: CustomerRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly idempotency?: IdempotencyStore;
  readonly survivorId: string;
  readonly mergeIds: readonly string[];
  readonly confirmationToken: string;
  readonly correlationId?: string;
}): Promise<{
  readonly data: Record<string, unknown>;
  readonly meta: Record<string, never>;
  readonly version: number;
}> {
  requireCustomerPermission(options.actorPermissions, "customer.merge");
  if (!options.idempotencyKey?.trim()) {
    throw new CustomerError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const key = options.idempotencyKey.trim();
  return runCustomerIdempotent({
    idempotency: options.idempotency,
    tenantId: options.tenantId,
    actorId: options.actorId,
    scope: "customer.merge",
    key,
    loadCached: () =>
      options.repo.getIdempotentMerge({
        tenantId: options.tenantId,
        idempotencyKey: key
      }),
    rememberCached: (customer) =>
      options.repo.rememberIdempotentMerge({
        tenantId: options.tenantId,
        idempotencyKey: key,
        customer
      }),
    loadById: (customerId) =>
      options.repo.getCustomer({ tenantId: options.tenantId, customerId }),
    toResult: (customer) => ({
      data: toCustomerResponseData(customer, options.actorPermissions),
      meta: {},
      version: customer.version
    }),
    execute: async () => {
      const mergeIds = normalizeMergeIds(options.survivorId, options.mergeIds);
      const expectedToken = computeMergeConfirmationToken(options.survivorId, mergeIds);
      if (!options.confirmationToken?.trim() || options.confirmationToken.trim() !== expectedToken) {
        throw new CustomerError(
          "confirmation_token does not match merge preview checksum.",
          "VALIDATION_FAILED"
        );
      }

      const { survivor, sources } = await loadActiveMergeSet({
        repo: options.repo,
        tenantId: options.tenantId,
        survivorId: options.survivorId,
        mergeIds
      });
      const fieldResolution = buildFieldResolution(survivor, sources);
      const merged = await options.repo.executeMerge({
        tenantId: options.tenantId,
        survivorId: options.survivorId,
        mergeIds,
        actorId: options.actorId,
        correlationId: options.correlationId?.trim() || key,
        fieldResolution
      });

      return {
        customer: merged,
        result: {
          data: toCustomerResponseData(merged, options.actorPermissions),
          meta: {},
          version: merged.version
        }
      };
    }
  });
}
