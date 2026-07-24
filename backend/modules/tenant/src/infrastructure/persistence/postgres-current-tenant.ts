import { sql } from "kysely";
import type { AppDatabase } from "@ai-sales/database";
import { adapterSecurityContext, withTenantTransaction } from "@ai-sales/database";
import {
  TenantSettingsError,
  type TenantResource,
  type TenantSettingsRepository,
  type TenantStatus
} from "../../application/current-tenant.js";

type TenantRow = {
  id: string;
  code: string;
  name: string;
  status: TenantStatus;
  version: number | string;
  created_at: Date | string;
  updated_at: Date | string;
};

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function toTenant(row: TenantRow): TenantResource {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    version: Number(row.version),
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at)
  };
}

export class PostgresCurrentTenantRepository implements TenantSettingsRepository {
  constructor(private readonly db: AppDatabase) {}

  async getCurrentTenant(tenantId: string): Promise<TenantResource | null> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<TenantRow>`
        select id::text, code::text, name, status, version, created_at, updated_at
        from app.tenants
        where id = ${tenantId}::uuid
        limit 1
      `.execute(trx);
      const row = result.rows[0];
      return row ? toTenant(row) : null;
    });
  }

  async updateCurrentTenant(args: {
    readonly tenantId: string;
    readonly expectedVersion: number;
    readonly name: string | null | undefined;
  }): Promise<TenantResource> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const current = await sql<TenantRow>`
        select id::text, code::text, name, status, version, created_at, updated_at
        from app.tenants
        where id = ${args.tenantId}::uuid
        limit 1
      `.execute(trx);
      const row = current.rows[0];
      if (!row) {
        throw new TenantSettingsError("Tenant not found.", "RESOURCE_NOT_FOUND");
      }
      if (Number(row.version) !== args.expectedVersion) {
        throw new TenantSettingsError("Tenant version conflict.", "RESOURCE_VERSION_MISMATCH");
      }

      const updated = await sql<TenantRow>`
        update app.tenants
        set name = ${args.name ?? row.name},
            version = version + 1,
            updated_at = now()
        where id = ${args.tenantId}::uuid
          and version = ${args.expectedVersion}
        returning id::text, code::text, name, status, version, created_at, updated_at
      `.execute(trx);
      const updatedRow = updated.rows[0];
      if (!updatedRow) {
        throw new TenantSettingsError("Tenant version conflict.", "RESOURCE_VERSION_MISMATCH");
      }
      return toTenant(updatedRow);
    });
  }
}
