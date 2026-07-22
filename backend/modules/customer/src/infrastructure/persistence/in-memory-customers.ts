import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import {
  CustomerError,
  type CustomerIdentityRecord,
  type CustomerIdentityType,
  type CustomerRepository,
  type CustomerResource,
  type CustomerStatus
} from "../../application/customers.js";

type Row = {
  id: string;
  tenantId: string;
  displayName: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  status: CustomerStatus;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
};

function toResource(row: Row): CustomerResource {
  return {
    id: row.id,
    tenant_id: row.tenantId,
    display_name: row.displayName,
    primary_email: row.primaryEmail,
    primary_phone: row.primaryPhone,
    status: row.status,
    tags: [...row.tags],
    version: row.version,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  };
}

export class InMemoryCustomerRepository implements CustomerRepository {
  private readonly byTenant = new Map<string, Map<string, Row>>();
  private readonly idempotency = new Map<string, CustomerResource>();
  private readonly identityIdempotency = new Map<string, CustomerResource>();
  /** key: `${tenantId}:${identityType}:${hash}` */
  private readonly identitiesByHash = new Map<string, CustomerIdentityRecord>();
  private readonly identitiesByCustomer = new Map<string, CustomerIdentityRecord[]>();

  private tenantMap(tenantId: string): Map<string, Row> {
    let map = this.byTenant.get(tenantId);
    if (!map) {
      map = new Map();
      this.byTenant.set(tenantId, map);
    }
    return map;
  }

  async listCustomers(tenantId: string): Promise<readonly CustomerResource[]> {
    return [...this.tenantMap(tenantId).values()].map(toResource);
  }

  async getCustomer(args: {
    readonly tenantId: string;
    readonly customerId: string;
  }): Promise<CustomerResource | null> {
    const row = this.tenantMap(args.tenantId).get(args.customerId);
    return row ? toResource(row) : null;
  }

  async createCustomer(args: {
    readonly tenantId: string;
    readonly customerId: UuidV7;
    readonly displayName: string | null;
    readonly primaryEmail: string | null;
    readonly primaryPhone: string | null;
    readonly tags: readonly string[];
  }): Promise<CustomerResource> {
    const now = new Date().toISOString();
    const row: Row = {
      id: args.customerId,
      tenantId: args.tenantId,
      displayName: args.displayName,
      primaryEmail: args.primaryEmail,
      primaryPhone: args.primaryPhone,
      status: "active",
      tags: [...args.tags],
      version: 1,
      createdAt: now,
      updatedAt: now
    };
    this.tenantMap(args.tenantId).set(row.id, row);
    return toResource(row);
  }

  async updateCustomer(args: {
    readonly tenantId: string;
    readonly customerId: string;
    readonly expectedVersion: number;
    readonly displayName: string | null | undefined;
    readonly primaryEmail: string | null | undefined;
    readonly primaryPhone: string | null | undefined;
  }): Promise<CustomerResource> {
    const row = this.tenantMap(args.tenantId).get(args.customerId);
    if (!row) {
      throw new CustomerError("Customer not found.", "RESOURCE_NOT_FOUND");
    }
    if (row.version !== args.expectedVersion) {
      throw new CustomerError("Customer version conflict.", "RESOURCE_VERSION_MISMATCH");
    }
    if (args.displayName !== undefined) row.displayName = args.displayName;
    if (args.primaryEmail !== undefined) row.primaryEmail = args.primaryEmail;
    if (args.primaryPhone !== undefined) row.primaryPhone = args.primaryPhone;
    row.version += 1;
    row.updatedAt = new Date().toISOString();
    return toResource(row);
  }

  async getIdempotentCreate(args: {
    readonly tenantId: string;
    readonly idempotencyKey: string;
  }): Promise<CustomerResource | null> {
    return this.idempotency.get(`${args.tenantId}:${args.idempotencyKey}`) ?? null;
  }

  async rememberIdempotentCreate(args: {
    readonly tenantId: string;
    readonly idempotencyKey: string;
    readonly customer: CustomerResource;
  }): Promise<void> {
    this.idempotency.set(`${args.tenantId}:${args.idempotencyKey}`, args.customer);
  }

  async findIdentityByHash(args: {
    readonly tenantId: string;
    readonly identityType: CustomerIdentityType;
    readonly normalizedValueHash: string;
  }): Promise<CustomerIdentityRecord | null> {
    return (
      this.identitiesByHash.get(
        `${args.tenantId}:${args.identityType}:${args.normalizedValueHash}`
      ) ?? null
    );
  }

  async addIdentity(args: {
    readonly tenantId: string;
    readonly customerId: string;
    readonly identityId: UuidV7;
    readonly identityType: CustomerIdentityType;
    readonly normalizedValueHash: string;
    readonly externalId: string | null;
    readonly isPrimary: boolean;
  }): Promise<CustomerIdentityRecord> {
    const hashKey = `${args.tenantId}:${args.identityType}:${args.normalizedValueHash}`;
    if (this.identitiesByHash.has(hashKey)) {
      throw new CustomerError(
        "Identity already attached to another customer.",
        "CUSTOMER_IDENTITY_CONFLICT"
      );
    }
    if (!this.tenantMap(args.tenantId).has(args.customerId)) {
      throw new CustomerError("Customer not found.", "RESOURCE_NOT_FOUND");
    }
    const record: CustomerIdentityRecord = {
      id: args.identityId,
      tenantId: args.tenantId,
      customerId: args.customerId,
      identityType: args.identityType,
      normalizedValueHash: args.normalizedValueHash,
      externalId: args.externalId,
      isPrimary: args.isPrimary
    };
    this.identitiesByHash.set(hashKey, record);
    const ck = `${args.tenantId}:${args.customerId}`;
    const list = this.identitiesByCustomer.get(ck) ?? [];
    list.push(record);
    this.identitiesByCustomer.set(ck, list);
    return record;
  }

  async getIdempotentIdentityAttach(args: {
    readonly tenantId: string;
    readonly idempotencyKey: string;
  }): Promise<CustomerResource | null> {
    return this.identityIdempotency.get(`${args.tenantId}:${args.idempotencyKey}`) ?? null;
  }

  async rememberIdempotentIdentityAttach(args: {
    readonly tenantId: string;
    readonly idempotencyKey: string;
    readonly customer: CustomerResource;
  }): Promise<void> {
    this.identityIdempotency.set(`${args.tenantId}:${args.idempotencyKey}`, args.customer);
  }

  /** Test helper — seed a row in another tenant to prove isolation. */
  seed(args: {
    readonly tenantId: string;
    readonly customerId?: string;
    readonly displayName?: string | null;
  }): CustomerResource {
    const id = (args.customerId ?? generateUuidV7()) as UuidV7;
    const now = new Date().toISOString();
    const row: Row = {
      id,
      tenantId: args.tenantId,
      displayName: args.displayName ?? "Other tenant",
      primaryEmail: "secret@other.example",
      primaryPhone: "+84900000000",
      status: "active",
      tags: [],
      version: 1,
      createdAt: now,
      updatedAt: now
    };
    this.tenantMap(args.tenantId).set(id, row);
    return toResource(row);
  }
}
