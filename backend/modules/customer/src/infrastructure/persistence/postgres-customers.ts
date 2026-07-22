import { sql } from "kysely";
import type { AppDatabase } from "@ai-sales/database";
import { adapterSecurityContext, withTenantTransaction } from "@ai-sales/database";
import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import {
  CustomerError,
  hashNormalizedIdentity,
  type CustomerIdentityRecord,
  type CustomerIdentityType,
  type CustomerRepository,
  type CustomerResource,
  type CustomerStatus
} from "../../application/customers.js";

const PII_PREFIX = "v0:";

function encryptPii(value: string | null): Buffer | null {
  if (value == null) return null;
  return Buffer.from(`${PII_PREFIX}${value}`, "utf8");
}

function decryptPii(buf: Buffer | null): string | null {
  if (!buf) return null;
  const text = buf.toString("utf8");
  return text.startsWith(PII_PREFIX) ? text.slice(PII_PREFIX.length) : text;
}

type CustomerRow = {
  id: string;
  tenant_id: string;
  display_name: string | null;
  email_encrypted: Buffer | null;
  phone_encrypted: Buffer | null;
  status: CustomerStatus;
  merged_into_customer_id: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
};

function toResource(row: CustomerRow, tags: readonly string[]): CustomerResource {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    display_name: row.display_name,
    primary_email: decryptPii(row.email_encrypted),
    primary_phone: decryptPii(row.phone_encrypted),
    status: row.status,
    tags: [...tags],
    version: Number(row.version),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString()
  };
}

async function loadTags(
  trx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
  tenantId: string,
  customerId: string
): Promise<string[]> {
  const result = await sql<{ name: string }>`
    select t.name
    from app.customer_tag_links l
    join app.customer_tags t on t.id = l.tag_id and t.tenant_id = l.tenant_id
    where l.tenant_id = ${tenantId}::uuid and l.customer_id = ${customerId}::uuid
    order by t.name
  `.execute(trx);
  return result.rows.map((r: { name: string }) => r.name);
}

async function syncTags(
  trx: Parameters<Parameters<typeof withTenantTransaction>[2]>[0],
  tenantId: string,
  customerId: string,
  tags: readonly string[]
): Promise<void> {
  await sql`
    delete from app.customer_tag_links
    where tenant_id = ${tenantId}::uuid and customer_id = ${customerId}::uuid
  `.execute(trx);
  for (const raw of tags) {
    const name = raw.trim();
    if (!name) continue;
    const existing = await sql<{ id: string }>`
      select id from app.customer_tags
      where tenant_id = ${tenantId}::uuid and name = ${name}
      limit 1
    `.execute(trx);
    let tagId = existing.rows[0]?.id;
    if (!tagId) {
      tagId = generateUuidV7();
      await sql`
        insert into app.customer_tags (id, tenant_id, name)
        values (${tagId}::uuid, ${tenantId}::uuid, ${name})
      `.execute(trx);
    }
    const linkId = generateUuidV7();
    await sql`
      insert into app.customer_tag_links (id, tenant_id, customer_id, tag_id)
      values (${linkId}::uuid, ${tenantId}::uuid, ${customerId}::uuid, ${tagId}::uuid)
      on conflict (tenant_id, customer_id, tag_id) do nothing
    `.execute(trx);
  }
}

/**
 * Customer Postgres adapter.
 * HTTP idempotency is via PostgresIdempotencyStore at application layer
 * (get/remember below are no-ops kept for CustomerRepository interface / InMemory parity).
 */
export class PostgresCustomerRepository implements CustomerRepository {
  constructor(private readonly db: AppDatabase) {}

  async listCustomers(tenantId: string): Promise<readonly CustomerResource[]> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const rows = await sql<CustomerRow>`
        select id, tenant_id, display_name, email_encrypted, phone_encrypted,
               status, merged_into_customer_id, version, created_at, updated_at
        from app.customers
        order by created_at desc
      `.execute(trx);
      const out: CustomerResource[] = [];
      for (const row of rows.rows) {
        const tags = await loadTags(trx, tenantId, row.id);
        out.push(toResource(row, tags));
      }
      return out;
    });
  }

  async getCustomer(args: {
    readonly tenantId: string;
    readonly customerId: string;
  }): Promise<CustomerResource | null> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<CustomerRow>`
        select id, tenant_id, display_name, email_encrypted, phone_encrypted,
               status, merged_into_customer_id, version, created_at, updated_at
        from app.customers
        where id = ${args.customerId}::uuid
      `.execute(trx);
      const row = result.rows[0];
      if (!row) return null;
      const tags = await loadTags(trx, args.tenantId, row.id);
      return toResource(row, tags);
    });
  }

  async createCustomer(args: {
    readonly tenantId: string;
    readonly customerId: UuidV7;
    readonly displayName: string | null;
    readonly primaryEmail: string | null;
    readonly primaryPhone: string | null;
    readonly tags: readonly string[];
  }): Promise<CustomerResource> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const emailBlind =
        args.primaryEmail != null ? hashNormalizedIdentity(args.primaryEmail) : null;
      const phoneBlind =
        args.primaryPhone != null ? hashNormalizedIdentity(args.primaryPhone) : null;
      const inserted = await sql<CustomerRow>`
        insert into app.customers (
          id, tenant_id, display_name, email_encrypted, email_blind_index,
          phone_encrypted, phone_blind_index, status
        ) values (
          ${args.customerId}::uuid,
          ${args.tenantId}::uuid,
          ${args.displayName},
          ${encryptPii(args.primaryEmail)},
          ${emailBlind},
          ${encryptPii(args.primaryPhone)},
          ${phoneBlind},
          'active'
        )
        returning id, tenant_id, display_name, email_encrypted, phone_encrypted,
                  status, merged_into_customer_id, version, created_at, updated_at
      `.execute(trx);
      if (args.tags.length > 0) {
        await syncTags(trx, args.tenantId, args.customerId, args.tags);
      }
      const row = inserted.rows[0]!;
      return toResource(row, args.tags);
    });
  }

  async updateCustomer(args: {
    readonly tenantId: string;
    readonly customerId: string;
    readonly expectedVersion: number;
    readonly displayName: string | null | undefined;
    readonly primaryEmail: string | null | undefined;
    readonly primaryPhone: string | null | undefined;
  }): Promise<CustomerResource> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const current = await sql<CustomerRow>`
        select id, tenant_id, display_name, email_encrypted, phone_encrypted,
               status, merged_into_customer_id, version, created_at, updated_at
        from app.customers
        where id = ${args.customerId}::uuid
      `.execute(trx);
      const row = current.rows[0];
      if (!row) {
        throw new CustomerError("Customer not found.", "RESOURCE_NOT_FOUND");
      }
      if (Number(row.version) !== args.expectedVersion) {
        throw new CustomerError("Customer version conflict.", "RESOURCE_VERSION_MISMATCH");
      }

      const displayName = args.displayName !== undefined ? args.displayName : row.display_name;
      let emailEncrypted = row.email_encrypted;
      let emailBlind: string | null = null;
      let phoneEncrypted = row.phone_encrypted;
      let phoneBlind: string | null = null;

      if (args.primaryEmail !== undefined) {
        emailEncrypted = encryptPii(args.primaryEmail);
        emailBlind = args.primaryEmail != null ? hashNormalizedIdentity(args.primaryEmail) : null;
      } else if (row.email_encrypted) {
        const plain = decryptPii(row.email_encrypted);
        emailBlind = plain != null ? hashNormalizedIdentity(plain) : null;
      }

      if (args.primaryPhone !== undefined) {
        phoneEncrypted = encryptPii(args.primaryPhone);
        phoneBlind = args.primaryPhone != null ? hashNormalizedIdentity(args.primaryPhone) : null;
      } else if (row.phone_encrypted) {
        const plain = decryptPii(row.phone_encrypted);
        phoneBlind = plain != null ? hashNormalizedIdentity(plain) : null;
      }

      const updated = await sql<CustomerRow>`
        update app.customers
        set display_name = ${displayName},
            email_encrypted = ${emailEncrypted},
            email_blind_index = ${emailBlind},
            phone_encrypted = ${phoneEncrypted},
            phone_blind_index = ${phoneBlind},
            version = version + 1,
            updated_at = now()
        where id = ${args.customerId}::uuid
          and tenant_id = ${args.tenantId}::uuid
          and version = ${args.expectedVersion}
        returning id, tenant_id, display_name, email_encrypted, phone_encrypted,
                  status, merged_into_customer_id, version, created_at, updated_at
      `.execute(trx);
      const next = updated.rows[0];
      if (!next) {
        throw new CustomerError("Customer version conflict.", "RESOURCE_VERSION_MISMATCH");
      }
      const tags = await loadTags(trx, args.tenantId, args.customerId);
      return toResource(next, tags);
    });
  }

  async getIdempotentCreate(_args: {
    readonly tenantId: string;
    readonly idempotencyKey: string;
  }): Promise<CustomerResource | null> {
    return null;
  }

  async rememberIdempotentCreate(_args: {
    readonly tenantId: string;
    readonly idempotencyKey: string;
    readonly customer: CustomerResource;
  }): Promise<void> {
    /* no-op — use IdempotencyStore */
  }

  async findIdentityByHash(args: {
    readonly tenantId: string;
    readonly identityType: CustomerIdentityType;
    readonly normalizedValueHash: string;
  }): Promise<CustomerIdentityRecord | null> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<{
        id: string;
        tenant_id: string;
        customer_id: string;
        identity_type: CustomerIdentityType;
        normalized_value_hash: string;
        external_id: string | null;
        is_primary: boolean;
      }>`
        select id, tenant_id, customer_id, identity_type, normalized_value_hash,
               external_id, is_primary
        from app.customer_identities
        where identity_type = ${args.identityType}
          and normalized_value_hash = ${args.normalizedValueHash}
        limit 1
      `.execute(trx);
      const row = result.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        tenantId: row.tenant_id,
        customerId: row.customer_id,
        identityType: row.identity_type,
        normalizedValueHash: row.normalized_value_hash,
        externalId: row.external_id,
        isPrimary: row.is_primary
      };
    });
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
    const ctx = adapterSecurityContext(args.tenantId);
    try {
      return await withTenantTransaction(this.db, ctx, async (trx) => {
        const customer = await sql<{ id: string }>`
          select id from app.customers where id = ${args.customerId}::uuid
        `.execute(trx);
        if (!customer.rows[0]) {
          throw new CustomerError("Customer not found.", "RESOURCE_NOT_FOUND");
        }
        await sql`
          insert into app.customer_identities (
            id, tenant_id, customer_id, identity_type, normalized_value_hash,
            external_id, is_primary
          ) values (
            ${args.identityId}::uuid,
            ${args.tenantId}::uuid,
            ${args.customerId}::uuid,
            ${args.identityType},
            ${args.normalizedValueHash},
            ${args.externalId},
            ${args.isPrimary}
          )
        `.execute(trx);
        return {
          id: args.identityId,
          tenantId: args.tenantId,
          customerId: args.customerId,
          identityType: args.identityType,
          normalizedValueHash: args.normalizedValueHash,
          externalId: args.externalId,
          isPrimary: args.isPrimary
        };
      });
    } catch (error) {
      const code =
        typeof error === "object" && error && "code" in error
          ? String((error as { code: string }).code)
          : "";
      if (code === "23505") {
        throw new CustomerError(
          "Identity already attached to another customer.",
          "CUSTOMER_IDENTITY_CONFLICT"
        );
      }
      throw error;
    }
  }

  async getIdempotentIdentityAttach(_args: {
    readonly tenantId: string;
    readonly idempotencyKey: string;
  }): Promise<CustomerResource | null> {
    return null;
  }

  async rememberIdempotentIdentityAttach(_args: {
    readonly tenantId: string;
    readonly idempotencyKey: string;
    readonly customer: CustomerResource;
  }): Promise<void> {
    /* no-op — use IdempotencyStore */
  }

  async getIdempotentMerge(_args: {
    readonly tenantId: string;
    readonly idempotencyKey: string;
  }): Promise<CustomerResource | null> {
    return null;
  }

  async rememberIdempotentMerge(_args: {
    readonly tenantId: string;
    readonly idempotencyKey: string;
    readonly customer: CustomerResource;
  }): Promise<void> {
    /* no-op — use IdempotencyStore */
  }

  async executeMerge(args: {
    readonly tenantId: string;
    readonly survivorId: string;
    readonly mergeIds: readonly string[];
    readonly actorId: string;
    readonly correlationId: string;
    readonly fieldResolution: Record<string, unknown>;
  }): Promise<CustomerResource> {
    const ctx = adapterSecurityContext(args.tenantId, args.actorId, args.correlationId);
    const lockOrder = [...new Set([args.survivorId, ...args.mergeIds])].sort();

    return withTenantTransaction(this.db, ctx, async (trx) => {
      const locked = await sql<CustomerRow>`
        select id, tenant_id, display_name, email_encrypted, phone_encrypted,
               status, merged_into_customer_id, version, created_at, updated_at
        from app.customers
        where id = any(${lockOrder}::uuid[])
        order by id
        for update
      `.execute(trx);

      if (locked.rows.length !== lockOrder.length) {
        throw new CustomerError("Customer not found.", "RESOURCE_NOT_FOUND");
      }
      for (const row of locked.rows) {
        if (row.status !== "active") {
          throw new CustomerError("Customer is not mergeable.", "CUSTOMER_MERGE_CONFLICT");
        }
      }

      const survivor = locked.rows.find((r: CustomerRow) => r.id === args.survivorId);
      if (!survivor) {
        throw new CustomerError("Survivor customer not found.", "RESOURCE_NOT_FOUND");
      }

      for (const sourceId of args.mergeIds) {
        await sql`
          update app.customer_identities
          set customer_id = ${args.survivorId}::uuid,
              version = version + 1,
              updated_at = now()
          where tenant_id = ${args.tenantId}::uuid
            and customer_id = ${sourceId}::uuid
        `.execute(trx);

        await sql`
          update app.customers
          set status = 'merged',
              merged_into_customer_id = ${args.survivorId}::uuid,
              version = version + 1,
              updated_at = now()
          where id = ${sourceId}::uuid
            and tenant_id = ${args.tenantId}::uuid
        `.execute(trx);

        await sql`
          insert into app.customer_merge_history (
            id, tenant_id, source_customer_id, target_customer_id,
            field_resolution, actor_id, correlation_id
          ) values (
            ${generateUuidV7()}::uuid,
            ${args.tenantId}::uuid,
            ${sourceId}::uuid,
            ${args.survivorId}::uuid,
            ${JSON.stringify(args.fieldResolution)}::jsonb,
            ${args.actorId}::uuid,
            ${args.correlationId}
          )
        `.execute(trx);
      }

      const resolvedName = args.fieldResolution.display_name;
      const resolvedEmail = args.fieldResolution.primary_email;
      const resolvedPhone = args.fieldResolution.primary_phone;
      const resolvedTags = args.fieldResolution.tags;

      let displayName = survivor.display_name;
      let emailEncrypted = survivor.email_encrypted;
      let emailBlind: string | null = null;
      let phoneEncrypted = survivor.phone_encrypted;
      let phoneBlind: string | null = null;

      if (typeof resolvedName === "string" || resolvedName === null) {
        displayName = resolvedName as string | null;
      }
      if (typeof resolvedEmail === "string" || resolvedEmail === null) {
        const email = resolvedEmail as string | null;
        emailEncrypted = encryptPii(email);
        emailBlind = email != null ? hashNormalizedIdentity(email) : null;
      } else if (survivor.email_encrypted) {
        const plain = decryptPii(survivor.email_encrypted);
        emailBlind = plain != null ? hashNormalizedIdentity(plain) : null;
      }
      if (typeof resolvedPhone === "string" || resolvedPhone === null) {
        const phone = resolvedPhone as string | null;
        phoneEncrypted = encryptPii(phone);
        phoneBlind = phone != null ? hashNormalizedIdentity(phone) : null;
      } else if (survivor.phone_encrypted) {
        const plain = decryptPii(survivor.phone_encrypted);
        phoneBlind = plain != null ? hashNormalizedIdentity(plain) : null;
      }

      const updatedSurvivor = await sql<CustomerRow>`
        update app.customers
        set display_name = ${displayName},
            email_encrypted = ${emailEncrypted},
            email_blind_index = ${emailBlind},
            phone_encrypted = ${phoneEncrypted},
            phone_blind_index = ${phoneBlind},
            version = version + 1,
            updated_at = now()
        where id = ${args.survivorId}::uuid
          and tenant_id = ${args.tenantId}::uuid
        returning id, tenant_id, display_name, email_encrypted, phone_encrypted,
                  status, merged_into_customer_id, version, created_at, updated_at
      `.execute(trx);
      const mergedRow = updatedSurvivor.rows[0]!;

      let tagNames: string[] = [];
      if (Array.isArray(resolvedTags)) {
        tagNames = resolvedTags.filter((t): t is string => typeof t === "string");
        await syncTags(trx, args.tenantId, args.survivorId, tagNames);
      } else {
        tagNames = await loadTags(trx, args.tenantId, args.survivorId);
      }

      const outboxId = generateUuidV7();
      await sql`
        insert into app.outbox_events (
          id, tenant_id, event_type, aggregate_type, aggregate_id, payload, correlation_id
        ) values (
          ${outboxId}::uuid,
          ${args.tenantId}::uuid,
          'com.aisales.customer.merged.v1',
          'customer',
          ${args.survivorId}::uuid,
          ${JSON.stringify({
            tenant_id: args.tenantId,
            source_ids: [...args.mergeIds],
            target_id: args.survivorId
          })}::jsonb,
          ${args.correlationId}
        )
      `.execute(trx);

      return toResource(mergedRow, tagNames);
    });
  }
}