/**
 * BE-FND-017 reference suite (persistence half) — tenant isolation, idempotency
 * replay, transaction rollback, and outbox envelope contract, all runnable
 * offline against a recording Kysely dialect (no DATABASE_URL required).
 * Live-DB RLS proof lives in packages/database/src/rls.integration.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  CompiledQuery,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseConnection,
  type Driver,
  type QueryResult
} from "kysely";
import type { AppDatabase, Database } from "@ai-sales/database";
import { TenantContextError } from "@ai-sales/database";
import { MemoryIdempotencyStore } from "@ai-sales/idempotency";
import {
  createTenantIsolationFixture,
  createTestSecurityContext,
  replayIdempotencyKey,
  testUuidV7
} from "@ai-sales/test-utils";
import { PostgresAuditWriter, PostgresOutboxWriter, PostgresWalkingSkeletonTracer } from "./walking-skeleton.persistence.js";

class RecordingConnection implements DatabaseConnection {
  readonly queries: CompiledQuery[] = [];
  failWhenSqlContains: string | undefined;

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    this.queries.push(compiledQuery);
    if (this.failWhenSqlContains && compiledQuery.sql.includes(this.failWhenSqlContains)) {
      throw new Error(`forced failure on: ${this.failWhenSqlContains}`);
    }
    return { rows: [] };
  }

  streamQuery(): AsyncIterableIterator<QueryResult<never>> {
    throw new Error("streaming not supported in recording connection");
  }
}

class RecordingDriver implements Driver {
  constructor(private readonly connection: RecordingConnection) {}
  async init(): Promise<void> {}
  async acquireConnection(): Promise<DatabaseConnection> {
    return this.connection;
  }
  async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("begin"));
  }
  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("commit"));
  }
  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("rollback"));
  }
  async releaseConnection(): Promise<void> {}
  async destroy(): Promise<void> {}
}

function createRecordingDb(): { db: AppDatabase; connection: RecordingConnection } {
  const connection = new RecordingConnection();
  const db = new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new RecordingDriver(connection),
      createIntrospector: (kysely) => new PostgresIntrospector(kysely),
      createQueryCompiler: () => new PostgresQueryCompiler()
    }
  });
  return { db, connection };
}

function createTracer(db: AppDatabase): PostgresWalkingSkeletonTracer {
  return new PostgresWalkingSkeletonTracer(db, new PostgresAuditWriter(db), new PostgresOutboxWriter(db));
}

function nextIds() {
  return {
    auditId: testUuidV7("018f65fd-7c70-7c2a-9c8f-46e0f7a1f001"),
    outboxId: testUuidV7("018f65fd-7c71-7c2a-9c8f-46e0f7a1f002"),
    aggregateId: testUuidV7("018f65fd-7c72-7c2a-9c8f-46e0f7a1f003")
  };
}

describe("BE-FND-017 · tenant isolation", () => {
  it("stamps every transaction and row with the caller's tenant, never another tenant's", async () => {
    const { tenantA, tenantB } = createTenantIsolationFixture();
    for (const ctx of [tenantA, tenantB]) {
      const { db, connection } = createRecordingDb();
      await createTracer(db).trace(ctx, "hello", nextIds());

      const setTenant = connection.queries.find((q) => q.sql.includes("app.tenant_id"));
      expect(setTenant?.parameters).toContain(ctx.tenantId);

      const inserts = connection.queries.filter((q) => q.sql.startsWith("insert into"));
      expect(inserts).toHaveLength(2); // audit + outbox in one transaction
      const otherTenant = ctx === tenantA ? tenantB : tenantA;
      for (const insert of inserts) {
        expect(insert.parameters).toContain(ctx.tenantId);
        expect(insert.parameters).not.toContain(otherTenant.tenantId);
      }
    }
  });

  it("refuses to open a transaction without a complete tenant security context", async () => {
    const { db, connection } = createRecordingDb();
    const badCtx = createTestSecurityContext({ tenantId: "" as never });
    await expect(createTracer(db).trace(badCtx, "hello", nextIds())).rejects.toBeInstanceOf(TenantContextError);
    expect(connection.queries).toHaveLength(0); // denied before any SQL
  });
});

describe("BE-FND-017 · idempotency replay", () => {
  it("replays the same idempotency key without executing the trace twice", async () => {
    const { db, connection } = createRecordingDb();
    const tracer = createTracer(db);
    const ctx = createTestSecurityContext({ permissions: ["audit.read"] });
    const store = new MemoryIdempotencyStore();

    const { first, second, executions } = await replayIdempotencyKey(
      store,
      ctx,
      { scope: "walking_skeleton.trace", key: "key-1", requestHash: "hash-1", ttlSeconds: 60 },
      async () => {
        const result = await tracer.trace(ctx, "hello", nextIds());
        return { resourceId: result.auditId, responseStatus: 200, responseBody: { data: result } };
      }
    );

    expect(first.outcome).toBe("acquired");
    expect(second.outcome).toBe("replay");
    expect(executions).toBe(1);
    expect(connection.queries.filter((q) => q.sql.includes("audit_events"))).toHaveLength(1);
  });
});

describe("BE-FND-017 · transaction rollback", () => {
  it("rolls back the audit row when the outbox append fails (single transaction)", async () => {
    const { db, connection } = createRecordingDb();
    connection.failWhenSqlContains = "outbox_events";
    const ctx = createTestSecurityContext({ permissions: ["audit.read"] });

    await expect(createTracer(db).trace(ctx, "hello", nextIds())).rejects.toThrow("forced failure");

    const rawStatements = connection.queries.map((q) => q.sql);
    expect(rawStatements.filter((s) => s === "begin")).toHaveLength(1); // one shared transaction
    expect(rawStatements).toContain("rollback");
    expect(rawStatements).not.toContain("commit");
    // Audit insert was attempted inside the same rolled-back transaction.
    expect(rawStatements.some((s) => s.includes("audit_events"))).toBe(true);
  });
});

describe("BE-FND-017 · outbox event contract", () => {
  it("emits walking_skeleton.traced envelope fields per contract", async () => {
    const { db, connection } = createRecordingDb();
    const ctx = createTestSecurityContext({ permissions: ["audit.read"] });
    const ids = nextIds();

    const result = await createTracer(db).trace(ctx, "hello", ids);

    expect(result).toEqual({
      auditId: ids.auditId,
      outboxEventId: ids.outboxId,
      correlationId: ctx.correlationId,
      action: "walking_skeleton.trace"
    });
    const outboxInsert = connection.queries.find((q) => q.sql.includes("outbox_events"));
    expect(outboxInsert?.parameters).toContain("walking_skeleton.traced");
    expect(outboxInsert?.parameters).toContain(ctx.correlationId);
    expect(outboxInsert?.parameters).toContain(ids.aggregateId);
  });
});
