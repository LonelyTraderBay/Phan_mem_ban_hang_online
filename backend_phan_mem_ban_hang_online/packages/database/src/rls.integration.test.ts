import { describe, expect, it } from "vitest";
import { sql } from "kysely";
import { createDatabase, withTenantTransaction, TenantContextError } from "./index.js";
import { createTenantIsolationFixture, createTestSecurityContext } from "@ai-sales/test-utils";
import { generateUuidV7 } from "@ai-sales/domain-kernel";

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describe("withTenantTransaction validation", () => {
  it("rejects empty correlation id before touching the database", async () => {
    const db = createDatabase("postgres://localhost/unused");
    await expect(
      withTenantTransaction(db, createTestSecurityContext({ correlationId: "" }), async () => "ok")
    ).rejects.toBeInstanceOf(TenantContextError);
  });
});

describeDb("RLS tenant isolation (integration)", () => {
  it("denies cross-tenant reads on audit_events under app.tenant_id", async () => {
    const db = createDatabase(databaseUrl!);
    const { tenantA, tenantB } = createTenantIsolationFixture({
      tenantA: { permissions: ["audit.read"] },
      tenantB: { permissions: ["audit.read"] }
    });
    const auditId = generateUuidV7();

    await withTenantTransaction(db, tenantA, async (trx) => {
      await trx
        .insertInto("app.audit_events")
        .values({
          id: auditId,
          tenant_id: tenantA.tenantId,
          action: "rls.test",
          actor_id: tenantA.actorId,
          correlation_id: tenantA.correlationId,
          payload: { ok: true }
        })
        .execute();
    });

    const seenByB = await withTenantTransaction(db, tenantB, async (trx) => {
      return trx.selectFrom("app.audit_events").selectAll().where("id", "=", auditId).execute();
    });
    expect(seenByB).toEqual([]);

    const seenByA = await withTenantTransaction(db, tenantA, async (trx) => {
      return trx.selectFrom("app.audit_events").selectAll().where("id", "=", auditId).execute();
    });
    expect(seenByA).toHaveLength(1);

    // Missing tenant context → deny (empty setting)
    await db.transaction().execute(async (trx) => {
      await sql`select set_config('app.tenant_id', '', true)`.execute(trx);
      const rows = await trx.selectFrom("app.audit_events").selectAll().where("id", "=", auditId).execute();
      expect(rows).toEqual([]);
    });

    await db.destroy();
  });
});
