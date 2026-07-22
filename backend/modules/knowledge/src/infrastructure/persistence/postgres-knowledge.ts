import { sql } from "kysely";
import type { AppDatabase } from "@ai-sales/database";
import { adapterSecurityContext, withTenantTransaction } from "@ai-sales/database";
import type { UuidV7 } from "@ai-sales/domain-kernel";
import {
  KnowledgeError,
  type IngestionStatus,
  type JobResponseStatus,
  type KnowledgeChunkRecord,
  type KnowledgeRepository,
  type KnowledgeResource,
  type KnowledgeSourceRecord,
  type KnowledgeSourceType,
  type KnowledgeStatus,
  type KnowledgeVersionRecord
} from "../../application/knowledge.js";

type Trx = Parameters<Parameters<typeof withTenantTransaction>[2]>[0];

type SourceRow = {
  id: string;
  tenant_id: string;
  name: string;
  source_type: KnowledgeSourceType;
  uri: string | null;
  version: number | string;
  created_at: Date;
  updated_at: Date;
};

type VersionRow = {
  id: string;
  tenant_id: string;
  source_id: string;
  title: string;
  body_markdown: string | null;
  status: KnowledgeStatus;
  content_checksum: string | null;
  effective_from: Date | null;
  effective_to: Date | null;
  approved_by: string | null;
  published_by: string | null;
  ingestion_status: IngestionStatus;
  chunk_count: number | string;
  ingestion_error: string | null;
  retry_count: number | string;
  version: number | string;
  created_at: Date;
  updated_at: Date;
};

type ChunkRow = {
  id: string;
  tenant_id: string;
  source_id: string;
  version_id: string;
  chunk_index: number | string;
  content_text: string;
  content_checksum: string;
  embedding_model: string | null;
  embedding_version: string | null;
  embedding_stub: unknown;
  token_count: number | string | null;
  language: string | null;
  effective_from: Date | null;
  effective_to: Date | null;
  created_at: Date;
};

const SOURCE_SELECT = sql`
  id, tenant_id, name, source_type, uri, version, created_at, updated_at
`;

const VERSION_SELECT = sql`
  id, tenant_id, source_id, title, body_markdown, status, content_checksum,
  effective_from, effective_to, approved_by, published_by, ingestion_status,
  chunk_count, ingestion_error, retry_count, version, created_at, updated_at
`;

const CHUNK_SELECT = sql`
  id, tenant_id, source_id, version_id, chunk_index, content_text, content_checksum,
  embedding_model, embedding_version, embedding_stub, token_count, language,
  effective_from, effective_to, created_at
`;

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function toSource(row: SourceRow): KnowledgeSourceRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    sourceType: row.source_type,
    uri: row.uri,
    version: Number(row.version),
    createdAt: toIso(row.created_at)!,
    updatedAt: toIso(row.updated_at)!
  };
}

function toVersion(row: VersionRow): KnowledgeVersionRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    sourceId: row.source_id,
    title: row.title,
    bodyMarkdown: row.body_markdown,
    status: row.status,
    contentChecksum: row.content_checksum,
    effectiveFrom: toIso(row.effective_from),
    effectiveTo: toIso(row.effective_to),
    approvedBy: row.approved_by,
    publishedBy: row.published_by,
    ingestionStatus: row.ingestion_status,
    chunkCount: Number(row.chunk_count),
    ingestionError: row.ingestion_error,
    retryCount: Number(row.retry_count),
    version: Number(row.version),
    createdAt: toIso(row.created_at)!,
    updatedAt: toIso(row.updated_at)!
  };
}

function toChunk(row: ChunkRow): KnowledgeChunkRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    sourceId: row.source_id,
    versionId: row.version_id,
    chunkIndex: Number(row.chunk_index),
    contentText: row.content_text,
    contentChecksum: row.content_checksum,
    embeddingModel: row.embedding_model ?? "stub-v1",
    embeddingVersion: row.embedding_version ?? "1",
    embeddingStub: parseObject(row.embedding_stub),
    tokenCount: row.token_count == null ? 0 : Number(row.token_count),
    language: row.language,
    effectiveFrom: toIso(row.effective_from),
    effectiveTo: toIso(row.effective_to),
    createdAt: toIso(row.created_at)!
  };
}

/**
 * Knowledge Postgres adapter.
 * HTTP idempotency is via PostgresIdempotencyStore at application layer
 * (get/save below are no-ops kept for KnowledgeRepository interface / InMemory parity).
 */
export class PostgresKnowledgeRepository implements KnowledgeRepository {
  constructor(private readonly db: AppDatabase) {}

  private async loadSource(
    trx: Trx,
    tenantId: string,
    sourceId: string
  ): Promise<KnowledgeSourceRecord | null> {
    const result = await sql<SourceRow>`
      select ${SOURCE_SELECT}
      from app.knowledge_sources
      where id = ${sourceId}::uuid and tenant_id = ${tenantId}::uuid
    `.execute(trx);
    const row = result.rows[0];
    return row ? toSource(row) : null;
  }

  private async loadVersion(
    trx: Trx,
    tenantId: string,
    versionId: string,
    options?: { readonly forUpdate?: boolean }
  ): Promise<KnowledgeVersionRecord | null> {
    const result = options?.forUpdate
      ? await sql<VersionRow>`
          select ${VERSION_SELECT}
          from app.knowledge_source_versions
          where id = ${versionId}::uuid and tenant_id = ${tenantId}::uuid
          for update
        `.execute(trx)
      : await sql<VersionRow>`
          select ${VERSION_SELECT}
          from app.knowledge_source_versions
          where id = ${versionId}::uuid and tenant_id = ${tenantId}::uuid
        `.execute(trx);
    const row = result.rows[0];
    return row ? toVersion(row) : null;
  }

  async createSource(args: {
    readonly tenantId: string;
    readonly sourceId: UuidV7;
    readonly name: string;
    readonly sourceType: KnowledgeSourceType;
    readonly uri: string | null;
    readonly actorId: string;
  }): Promise<KnowledgeSourceRecord> {
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<SourceRow>`
        insert into app.knowledge_sources (
          id, tenant_id, name, source_type, uri, version, created_by, updated_by
        ) values (
          ${args.sourceId}::uuid,
          ${args.tenantId}::uuid,
          ${args.name},
          ${args.sourceType},
          ${args.uri},
          1,
          ${args.actorId}::uuid,
          ${args.actorId}::uuid
        )
        returning ${SOURCE_SELECT}
      `.execute(trx);
      return toSource(result.rows[0]!);
    });
  }

  async listSources(tenantId: string): Promise<readonly KnowledgeSourceRecord[]> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<SourceRow>`
        select ${SOURCE_SELECT}
        from app.knowledge_sources
        where tenant_id = ${tenantId}::uuid
        order by created_at asc, id asc
      `.execute(trx);
      return result.rows.map(toSource);
    });
  }

  async getSource(args: {
    readonly tenantId: string;
    readonly sourceId: string;
  }): Promise<KnowledgeSourceRecord | null> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) =>
      this.loadSource(trx, args.tenantId, args.sourceId)
    );
  }

  async createVersion(args: {
    readonly tenantId: string;
    readonly versionId: UuidV7;
    readonly sourceId: string;
    readonly title: string;
    readonly bodyMarkdown: string | null;
    readonly actorId: string;
  }): Promise<KnowledgeVersionRecord> {
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const source = await this.loadSource(trx, args.tenantId, args.sourceId);
      if (!source) {
        throw new KnowledgeError("Source not found.", "RESOURCE_NOT_FOUND");
      }
      const result = await sql<VersionRow>`
        insert into app.knowledge_source_versions (
          id, tenant_id, source_id, title, body_markdown, status,
          ingestion_status, chunk_count, retry_count, version, created_by, updated_by
        ) values (
          ${args.versionId}::uuid,
          ${args.tenantId}::uuid,
          ${args.sourceId}::uuid,
          ${args.title},
          ${args.bodyMarkdown},
          'draft',
          'pending',
          0,
          0,
          1,
          ${args.actorId}::uuid,
          ${args.actorId}::uuid
        )
        returning ${VERSION_SELECT}
      `.execute(trx);
      return toVersion(result.rows[0]!);
    });
  }

  async getVersion(args: {
    readonly tenantId: string;
    readonly versionId: string;
  }): Promise<KnowledgeVersionRecord | null> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) =>
      this.loadVersion(trx, args.tenantId, args.versionId)
    );
  }

  async updateVersion(args: {
    readonly tenantId: string;
    readonly versionId: string;
    readonly expectedVersion: number;
    readonly title: string | null | undefined;
    readonly bodyMarkdown: string | null | undefined;
    readonly actorId: string;
  }): Promise<KnowledgeVersionRecord> {
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const current = await this.loadVersion(trx, args.tenantId, args.versionId, {
        forUpdate: true
      });
      if (!current) {
        throw new KnowledgeError("Version not found.", "RESOURCE_NOT_FOUND");
      }
      if (current.version !== args.expectedVersion) {
        throw new KnowledgeError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }
      const title = args.title != null ? args.title.trim() : current.title;
      const bodyMarkdown =
        args.bodyMarkdown !== undefined ? args.bodyMarkdown : current.bodyMarkdown;
      const updated = await sql<VersionRow>`
        update app.knowledge_source_versions
        set title = ${title},
            body_markdown = ${bodyMarkdown},
            version = version + 1,
            updated_at = now(),
            updated_by = ${args.actorId}::uuid
        where id = ${args.versionId}::uuid
          and tenant_id = ${args.tenantId}::uuid
          and version = ${args.expectedVersion}
        returning ${VERSION_SELECT}
      `.execute(trx);
      if (!updated.rows[0]) {
        throw new KnowledgeError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }
      return toVersion(updated.rows[0]);
    });
  }

  async transitionVersion(args: {
    readonly tenantId: string;
    readonly versionId: string;
    readonly expectedVersion: number | null;
    readonly toStatus: KnowledgeStatus;
    readonly actorId: string;
    readonly contentChecksum?: string | null;
    readonly approvedBy?: string | null;
    readonly publishedBy?: string | null;
    readonly effectiveFrom?: string | null;
    readonly effectiveTo?: string | null;
  }): Promise<KnowledgeVersionRecord> {
    const ctx = adapterSecurityContext(args.tenantId, args.actorId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const current = await this.loadVersion(trx, args.tenantId, args.versionId, {
        forUpdate: true
      });
      if (!current) {
        throw new KnowledgeError("Version not found.", "RESOURCE_NOT_FOUND");
      }
      if (args.expectedVersion !== null && current.version !== args.expectedVersion) {
        throw new KnowledgeError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }
      const contentChecksum =
        args.contentChecksum !== undefined ? args.contentChecksum : current.contentChecksum;
      const approvedBy =
        args.approvedBy !== undefined ? args.approvedBy : current.approvedBy;
      const publishedBy =
        args.publishedBy !== undefined ? args.publishedBy : current.publishedBy;
      const effectiveFrom =
        args.effectiveFrom !== undefined ? args.effectiveFrom : current.effectiveFrom;
      const effectiveTo =
        args.effectiveTo !== undefined ? args.effectiveTo : current.effectiveTo;
      const versionClause =
        args.expectedVersion !== null
          ? sql`and version = ${args.expectedVersion}`
          : sql``;

      // Archive prior published versions in the SAME transaction before publishing
      // so a failed publish does not leave the source without a published version.
      if (args.toStatus === "published") {
        await sql`
          update app.knowledge_source_versions
          set status = 'archived',
              effective_to = coalesce(effective_to, now()),
              version = version + 1,
              updated_at = now(),
              updated_by = ${args.actorId}::uuid
          where tenant_id = ${args.tenantId}::uuid
            and source_id = ${current.sourceId}::uuid
            and status = 'published'
            and id <> ${args.versionId}::uuid
        `.execute(trx);
      }

      const updated = await sql<VersionRow>`
        update app.knowledge_source_versions
        set status = ${args.toStatus},
            content_checksum = ${contentChecksum},
            approved_by = ${approvedBy}::uuid,
            published_by = ${publishedBy}::uuid,
            effective_from = ${effectiveFrom}::timestamptz,
            effective_to = ${effectiveTo}::timestamptz,
            version = version + 1,
            updated_at = now(),
            updated_by = ${args.actorId}::uuid
        where id = ${args.versionId}::uuid
          and tenant_id = ${args.tenantId}::uuid
          ${versionClause}
        returning ${VERSION_SELECT}
      `.execute(trx);
      if (!updated.rows[0]) {
        throw new KnowledgeError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
      }
      return toVersion(updated.rows[0]);
    });
  }

  async archivePreviousPublished(args: {
    readonly tenantId: string;
    readonly sourceId: string;
    readonly exceptVersionId: string;
    readonly actorId: string;
  }): Promise<void> {
    // No-op for Postgres: transitionVersion(to published) archives peers atomically.
    // Kept for interface parity with InMemory / application call order.
    void args;
  }

  async setIngestionState(args: {
    readonly tenantId: string;
    readonly versionId: string;
    readonly ingestionStatus: IngestionStatus;
    readonly chunkCount?: number;
    readonly ingestionError?: string | null;
    readonly retryCount?: number;
  }): Promise<KnowledgeVersionRecord> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const current = await this.loadVersion(trx, args.tenantId, args.versionId, {
        forUpdate: true
      });
      if (!current) {
        throw new KnowledgeError("Version not found.", "RESOURCE_NOT_FOUND");
      }
      const chunkCount = args.chunkCount ?? current.chunkCount;
      const ingestionError =
        args.ingestionError !== undefined ? args.ingestionError : current.ingestionError;
      const retryCount = args.retryCount ?? current.retryCount;
      const updated = await sql<VersionRow>`
        update app.knowledge_source_versions
        set ingestion_status = ${args.ingestionStatus},
            chunk_count = ${chunkCount},
            ingestion_error = ${ingestionError},
            retry_count = ${retryCount},
            updated_at = now()
        where id = ${args.versionId}::uuid and tenant_id = ${args.tenantId}::uuid
        returning ${VERSION_SELECT}
      `.execute(trx);
      return toVersion(updated.rows[0]!);
    });
  }

  async replaceChunks(args: {
    readonly tenantId: string;
    readonly sourceId: string;
    readonly versionId: string;
    readonly chunks: readonly {
      readonly chunkId: UuidV7;
      readonly chunkIndex: number;
      readonly contentText: string;
      readonly contentChecksum: string;
      readonly embeddingStub: Record<string, unknown>;
      readonly tokenCount: number;
      readonly effectiveFrom: string | null;
      readonly effectiveTo: string | null;
    }[];
  }): Promise<void> {
    const ctx = adapterSecurityContext(args.tenantId);
    await withTenantTransaction(this.db, ctx, async (trx) => {
      await sql`
        delete from app.knowledge_chunks
        where tenant_id = ${args.tenantId}::uuid
          and version_id = ${args.versionId}::uuid
      `.execute(trx);
      for (const chunk of args.chunks) {
        await sql`
          insert into app.knowledge_chunks (
            id, tenant_id, source_id, version_id, chunk_index, content_text,
            content_checksum, embedding_model, embedding_version, embedding_stub,
            token_count, language, effective_from, effective_to
          ) values (
            ${chunk.chunkId}::uuid,
            ${args.tenantId}::uuid,
            ${args.sourceId}::uuid,
            ${args.versionId}::uuid,
            ${chunk.chunkIndex},
            ${chunk.contentText},
            ${chunk.contentChecksum},
            'stub-v1',
            '1',
            ${JSON.stringify(chunk.embeddingStub)}::jsonb,
            ${chunk.tokenCount},
            null,
            ${chunk.effectiveFrom}::timestamptz,
            ${chunk.effectiveTo}::timestamptz
          )
        `.execute(trx);
      }
    });
  }

  async listPublishedChunks(tenantId: string): Promise<readonly KnowledgeChunkRecord[]> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<ChunkRow>`
        select ${CHUNK_SELECT}
        from app.knowledge_chunks c
        where c.tenant_id = ${tenantId}::uuid
          and exists (
            select 1
            from app.knowledge_source_versions v
            where v.id = c.version_id
              and v.tenant_id = c.tenant_id
              and v.status = 'published'
          )
        order by c.created_at asc, c.chunk_index asc
      `.execute(trx);
      return result.rows.map(toChunk);
    });
  }

  async getIdempotentResource(_tenantId: string, _key: string): Promise<KnowledgeResource | null> {
    return null;
  }

  async saveIdempotentResource(
    _tenantId: string,
    _key: string,
    _resource: KnowledgeResource
  ): Promise<void> {
    /* no-op — use IdempotencyStore */
  }

  async getIdempotentJobResponse(
    _tenantId: string,
    _key: string
  ): Promise<{
    readonly job_id: string;
    readonly status: JobResponseStatus;
    readonly status_url: string | null;
  } | null> {
    return null;
  }

  async saveIdempotentJobResponse(
    _tenantId: string,
    _key: string,
    _response: {
      readonly job_id: string;
      readonly status: JobResponseStatus;
      readonly status_url: string | null;
    }
  ): Promise<void> {
    /* no-op — use IdempotencyStore */
  }
}
