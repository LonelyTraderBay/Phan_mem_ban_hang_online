import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
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

type VersionRow = KnowledgeVersionRecord;
type SourceRow = KnowledgeSourceRecord;

function nowIso(): string {
  return new Date().toISOString();
}

export class InMemoryKnowledgeRepository implements KnowledgeRepository {
  private readonly sources = new Map<string, Map<string, SourceRow>>();
  private readonly versions = new Map<string, Map<string, VersionRow>>();
  private readonly chunks = new Map<string, KnowledgeChunkRecord[]>();
  private readonly idempotentResources = new Map<string, KnowledgeResource>();
  private readonly idempotentJobs = new Map<
    string,
    { readonly job_id: string; readonly status: JobResponseStatus; readonly status_url: string | null }
  >();

  private tenantMap<T>(store: Map<string, Map<string, T>>, tenantId: string): Map<string, T> {
    let map = store.get(tenantId);
    if (!map) {
      map = new Map();
      store.set(tenantId, map);
    }
    return map;
  }

  async createSource(args: {
    readonly tenantId: string;
    readonly sourceId: UuidV7;
    readonly name: string;
    readonly sourceType: KnowledgeSourceType;
    readonly uri: string | null;
    readonly actorId: string;
  }): Promise<KnowledgeSourceRecord> {
    const createdAt = nowIso();
    const row: SourceRow = {
      id: args.sourceId,
      tenantId: args.tenantId,
      name: args.name,
      sourceType: args.sourceType,
      uri: args.uri,
      version: 1,
      createdAt,
      updatedAt: createdAt
    };
    this.tenantMap(this.sources, args.tenantId).set(args.sourceId, row);
    return row;
  }

  async listSources(tenantId: string): Promise<readonly KnowledgeSourceRecord[]> {
    return [...(this.sources.get(tenantId)?.values() ?? [])];
  }

  async getSource(args: {
    readonly tenantId: string;
    readonly sourceId: string;
  }): Promise<KnowledgeSourceRecord | null> {
    return this.sources.get(args.tenantId)?.get(args.sourceId) ?? null;
  }

  async createVersion(args: {
    readonly tenantId: string;
    readonly versionId: UuidV7;
    readonly sourceId: string;
    readonly title: string;
    readonly bodyMarkdown: string | null;
    readonly actorId: string;
  }): Promise<KnowledgeVersionRecord> {
    const source = await this.getSource({ tenantId: args.tenantId, sourceId: args.sourceId });
    if (!source) {
      throw new KnowledgeError("Source not found.", "RESOURCE_NOT_FOUND");
    }
    const createdAt = nowIso();
    const row: VersionRow = {
      id: args.versionId,
      tenantId: args.tenantId,
      sourceId: args.sourceId,
      title: args.title,
      bodyMarkdown: args.bodyMarkdown,
      status: "draft",
      contentChecksum: null,
      effectiveFrom: null,
      effectiveTo: null,
      approvedBy: null,
      publishedBy: null,
      ingestionStatus: "pending",
      chunkCount: 0,
      ingestionError: null,
      retryCount: 0,
      version: 1,
      createdAt,
      updatedAt: createdAt
    };
    this.tenantMap(this.versions, args.tenantId).set(args.versionId, row);
    return row;
  }

  async getVersion(args: {
    readonly tenantId: string;
    readonly versionId: string;
  }): Promise<KnowledgeVersionRecord | null> {
    return this.versions.get(args.tenantId)?.get(args.versionId) ?? null;
  }

  async updateVersion(args: {
    readonly tenantId: string;
    readonly versionId: string;
    readonly expectedVersion: number;
    readonly title: string | null | undefined;
    readonly bodyMarkdown: string | null | undefined;
    readonly actorId: string;
  }): Promise<KnowledgeVersionRecord> {
    const current = await this.getVersion({ tenantId: args.tenantId, versionId: args.versionId });
    if (!current) {
      throw new KnowledgeError("Version not found.", "RESOURCE_NOT_FOUND");
    }
    if (current.version !== args.expectedVersion) {
      throw new KnowledgeError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
    }
    const updated: VersionRow = {
      ...current,
      title: args.title != null ? args.title.trim() : current.title,
      bodyMarkdown: args.bodyMarkdown !== undefined ? args.bodyMarkdown : current.bodyMarkdown,
      version: current.version + 1,
      updatedAt: nowIso()
    };
    this.tenantMap(this.versions, args.tenantId).set(args.versionId, updated);
    return updated;
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
    const current = await this.getVersion({ tenantId: args.tenantId, versionId: args.versionId });
    if (!current) {
      throw new KnowledgeError("Version not found.", "RESOURCE_NOT_FOUND");
    }
    if (args.expectedVersion !== null && current.version !== args.expectedVersion) {
      throw new KnowledgeError("Version mismatch.", "RESOURCE_VERSION_MISMATCH");
    }
    const updated: VersionRow = {
      ...current,
      status: args.toStatus,
      contentChecksum: args.contentChecksum !== undefined ? args.contentChecksum : current.contentChecksum,
      approvedBy: args.approvedBy !== undefined ? args.approvedBy : current.approvedBy,
      publishedBy: args.publishedBy !== undefined ? args.publishedBy : current.publishedBy,
      effectiveFrom: args.effectiveFrom !== undefined ? args.effectiveFrom : current.effectiveFrom,
      effectiveTo: args.effectiveTo !== undefined ? args.effectiveTo : current.effectiveTo,
      version: current.version + 1,
      updatedAt: nowIso()
    };
    this.tenantMap(this.versions, args.tenantId).set(args.versionId, updated);
    return updated;
  }

  async archivePreviousPublished(args: {
    readonly tenantId: string;
    readonly sourceId: string;
    readonly exceptVersionId: string;
    readonly actorId: string;
  }): Promise<void> {
    const versions = this.versions.get(args.tenantId);
    if (!versions) return;
    for (const [id, row] of versions) {
      if (row.sourceId === args.sourceId && row.status === "published" && id !== args.exceptVersionId) {
        versions.set(id, {
          ...row,
          status: "archived",
          effectiveTo: nowIso(),
          version: row.version + 1,
          updatedAt: nowIso()
        });
      }
    }
  }

  async setIngestionState(args: {
    readonly tenantId: string;
    readonly versionId: string;
    readonly ingestionStatus: IngestionStatus;
    readonly chunkCount?: number;
    readonly ingestionError?: string | null;
    readonly retryCount?: number;
  }): Promise<KnowledgeVersionRecord> {
    const current = await this.getVersion({ tenantId: args.tenantId, versionId: args.versionId });
    if (!current) {
      throw new KnowledgeError("Version not found.", "RESOURCE_NOT_FOUND");
    }
    const updated: VersionRow = {
      ...current,
      ingestionStatus: args.ingestionStatus,
      chunkCount: args.chunkCount ?? current.chunkCount,
      ingestionError: args.ingestionError !== undefined ? args.ingestionError : current.ingestionError,
      retryCount: args.retryCount ?? current.retryCount,
      updatedAt: nowIso()
    };
    this.tenantMap(this.versions, args.tenantId).set(args.versionId, updated);
    return updated;
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
    const createdAt = nowIso();
    const rows: KnowledgeChunkRecord[] = args.chunks.map((chunk) => ({
      id: chunk.chunkId,
      tenantId: args.tenantId,
      sourceId: args.sourceId,
      versionId: args.versionId,
      chunkIndex: chunk.chunkIndex,
      contentText: chunk.contentText,
      contentChecksum: chunk.contentChecksum,
      embeddingModel: "stub-v1",
      embeddingVersion: "1",
      embeddingStub: chunk.embeddingStub,
      tokenCount: chunk.tokenCount,
      language: null,
      effectiveFrom: chunk.effectiveFrom,
      effectiveTo: chunk.effectiveTo,
      createdAt
    }));
    const key = `${args.tenantId}:${args.versionId}`;
    this.chunks.set(key, rows);
  }

  async listPublishedChunks(tenantId: string): Promise<readonly KnowledgeChunkRecord[]> {
    const versions = this.versions.get(tenantId);
    if (!versions) return [];
    const publishedIds = new Set(
      [...versions.values()].filter((v) => v.status === "published").map((v) => v.id)
    );
    const all: KnowledgeChunkRecord[] = [];
    for (const [key, rows] of this.chunks) {
      if (!key.startsWith(`${tenantId}:`)) continue;
      for (const row of rows) {
        if (publishedIds.has(row.versionId)) {
          all.push(row);
        }
      }
    }
    return all;
  }

  async getIdempotentResource(tenantId: string, key: string): Promise<KnowledgeResource | null> {
    return this.idempotentResources.get(`${tenantId}:${key}`) ?? null;
  }

  async saveIdempotentResource(tenantId: string, key: string, resource: KnowledgeResource): Promise<void> {
    this.idempotentResources.set(`${tenantId}:${key}`, resource);
  }

  async getIdempotentJobResponse(
    tenantId: string,
    key: string
  ): Promise<{ readonly job_id: string; readonly status: JobResponseStatus; readonly status_url: string | null } | null> {
    return this.idempotentJobs.get(`${tenantId}:${key}`) ?? null;
  }

  async saveIdempotentJobResponse(
    tenantId: string,
    key: string,
    response: { readonly job_id: string; readonly status: JobResponseStatus; readonly status_url: string | null }
  ): Promise<void> {
    this.idempotentJobs.set(`${tenantId}:${key}`, response);
  }
}
