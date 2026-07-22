import { createHash } from "node:crypto";
import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";

/**
 * BE-KNW-001…006 — Knowledge application layer (sources, versions, ingestion stubs,
 * published retrieval). In-memory until Postgres adapter. Mirrors catalog/inventory style.
 */

export type KnowledgeStatus = "draft" | "in_review" | "approved" | "published" | "archived";
export type KnowledgeSourceType = "url" | "upload" | "manual";
export type IngestionStatus = "pending" | "queued" | "running" | "completed" | "failed";
export type JobResponseStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type KnowledgePermission =
  | "knowledge.read"
  | "knowledge.write"
  | "knowledge.approve"
  | "knowledge.publish";

export type KnowledgeErrorCode =
  | "VALIDATION_FAILED"
  | "INSUFFICIENT_PERMISSION"
  | "RESOURCE_NOT_FOUND"
  | "RESOURCE_VERSION_MISMATCH"
  | "IDEMPOTENCY_KEY_REQUIRED";

export class KnowledgeError extends Error {
  constructor(
    message: string,
    readonly code: KnowledgeErrorCode
  ) {
    super(message);
    this.name = "KnowledgeError";
  }
}

/** Frozen OpenAPI KnowledgeResource (enterprise doc-freeze W1). */
export interface KnowledgeResource {
  readonly id: string;
  readonly tenant_id: string;
  readonly title: string | null;
  readonly status: KnowledgeStatus;
  readonly version: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface KnowledgeSourceRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly sourceType: KnowledgeSourceType;
  readonly uri: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface KnowledgeVersionRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly sourceId: string;
  readonly title: string;
  readonly bodyMarkdown: string | null;
  readonly status: KnowledgeStatus;
  readonly contentChecksum: string | null;
  readonly effectiveFrom: string | null;
  readonly effectiveTo: string | null;
  readonly approvedBy: string | null;
  readonly publishedBy: string | null;
  readonly ingestionStatus: IngestionStatus;
  readonly chunkCount: number;
  readonly ingestionError: string | null;
  readonly retryCount: number;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface KnowledgeChunkRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly sourceId: string;
  readonly versionId: string;
  readonly chunkIndex: number;
  readonly contentText: string;
  readonly contentChecksum: string;
  readonly embeddingModel: string;
  readonly embeddingVersion: string;
  readonly embeddingStub: Record<string, unknown>;
  readonly tokenCount: number;
  readonly language: string | null;
  readonly effectiveFrom: string | null;
  readonly effectiveTo: string | null;
  readonly createdAt: string;
}

export interface PublishedSearchHit {
  readonly chunkId: string;
  readonly versionId: string;
  readonly sourceId: string;
  readonly title: string;
  readonly snippet: string;
  readonly score: number;
}

export interface KnowledgeRepository {
  createSource(args: {
    readonly tenantId: string;
    readonly sourceId: UuidV7;
    readonly name: string;
    readonly sourceType: KnowledgeSourceType;
    readonly uri: string | null;
    readonly actorId: string;
  }): Promise<KnowledgeSourceRecord>;
  listSources(tenantId: string): Promise<readonly KnowledgeSourceRecord[]>;
  getSource(args: { readonly tenantId: string; readonly sourceId: string }): Promise<KnowledgeSourceRecord | null>;

  createVersion(args: {
    readonly tenantId: string;
    readonly versionId: UuidV7;
    readonly sourceId: string;
    readonly title: string;
    readonly bodyMarkdown: string | null;
    readonly actorId: string;
  }): Promise<KnowledgeVersionRecord>;
  getVersion(args: { readonly tenantId: string; readonly versionId: string }): Promise<KnowledgeVersionRecord | null>;
  updateVersion(args: {
    readonly tenantId: string;
    readonly versionId: string;
    readonly expectedVersion: number;
    readonly title: string | null | undefined;
    readonly bodyMarkdown: string | null | undefined;
    readonly actorId: string;
  }): Promise<KnowledgeVersionRecord>;
  transitionVersion(args: {
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
  }): Promise<KnowledgeVersionRecord>;
  archivePreviousPublished(args: {
    readonly tenantId: string;
    readonly sourceId: string;
    readonly exceptVersionId: string;
    readonly actorId: string;
  }): Promise<void>;

  setIngestionState(args: {
    readonly tenantId: string;
    readonly versionId: string;
    readonly ingestionStatus: IngestionStatus;
    readonly chunkCount?: number;
    readonly ingestionError?: string | null;
    readonly retryCount?: number;
  }): Promise<KnowledgeVersionRecord>;

  replaceChunks(args: {
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
  }): Promise<void>;

  listPublishedChunks(tenantId: string): Promise<readonly KnowledgeChunkRecord[]>;

  getIdempotentResource(tenantId: string, key: string): Promise<KnowledgeResource | null>;
  saveIdempotentResource(tenantId: string, key: string, resource: KnowledgeResource): Promise<void>;
  getIdempotentJobResponse(
    tenantId: string,
    key: string
  ): Promise<{ readonly job_id: string; readonly status: JobResponseStatus; readonly status_url: string | null } | null>;
  saveIdempotentJobResponse(
    tenantId: string,
    key: string,
    response: { readonly job_id: string; readonly status: JobResponseStatus; readonly status_url: string | null }
  ): Promise<void>;
}

export function requireKnowledgePermission(
  actorPermissions: readonly string[],
  permission: KnowledgePermission
): void {
  if (!actorPermissions.includes(permission)) {
    throw new KnowledgeError("Permission denied.", "INSUFFICIENT_PERMISSION");
  }
}

export function computeContentChecksum(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** BE-KNW-003 — sandbox extraction stub; real parser lands in worker. */
export function extractContentStub(args: {
  readonly sourceType: KnowledgeSourceType;
  readonly uri: string | null;
  readonly bodyMarkdown: string | null;
}): string {
  if (args.bodyMarkdown?.trim()) {
    return args.bodyMarkdown.trim();
  }
  if (args.sourceType === "url" && args.uri) {
    return `[extracted:url] ${args.uri}`;
  }
  if (args.sourceType === "upload") {
    return "[extracted:upload] binary content placeholder";
  }
  return "";
}

/** BE-KNW-004 — chunk generation stub (paragraph split). */
export function generateChunksFromText(text: string): readonly string[] {
  const normalized = text.trim();
  if (!normalized) return [];
  const parts = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [normalized];
}

/** BE-KNW-004 — embedding stub (deterministic digest, no provider call). */
export function generateEmbeddingStub(text: string): Record<string, unknown> {
  return {
    stub: true,
    model: "stub-v1",
    digest: computeContentChecksum(text)
  };
}

function estimateTokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function sourceToResource(source: KnowledgeSourceRecord, status: KnowledgeStatus = "draft"): KnowledgeResource {
  return {
    id: source.id,
    tenant_id: source.tenantId,
    title: source.name,
    status,
    version: source.version,
    created_at: source.createdAt,
    updated_at: source.updatedAt
  };
}

function versionToResource(version: KnowledgeVersionRecord): KnowledgeResource {
  return {
    id: version.id,
    tenant_id: version.tenantId,
    title: version.title,
    status: version.status,
    version: version.version,
    created_at: version.createdAt,
    updated_at: version.updatedAt
  };
}

async function withIdempotency(
  repo: KnowledgeRepository,
  tenantId: string,
  idempotencyKey: string | null | undefined,
  run: () => Promise<KnowledgeResource>
): Promise<KnowledgeResource> {
  const key = idempotencyKey?.trim();
  if (!key) {
    throw new KnowledgeError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const cached = await repo.getIdempotentResource(tenantId, key);
  if (cached) return cached;
  const result = await run();
  await repo.saveIdempotentResource(tenantId, key, result);
  return result;
}

async function withJobIdempotency(
  repo: KnowledgeRepository,
  tenantId: string,
  idempotencyKey: string | null | undefined,
  run: () => Promise<{ readonly job_id: string; readonly status: JobResponseStatus; readonly status_url: string | null }>
): Promise<{ readonly job_id: string; readonly status: JobResponseStatus; readonly status_url: string | null }> {
  const key = idempotencyKey?.trim();
  if (!key) {
    throw new KnowledgeError("Idempotency-Key header is required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const cached = await repo.getIdempotentJobResponse(tenantId, key);
  if (cached) return cached;
  const result = await run();
  await repo.saveIdempotentJobResponse(tenantId, key, result);
  return result;
}

function assertTransition(from: KnowledgeStatus, to: KnowledgeStatus): void {
  const allowed: Record<KnowledgeStatus, readonly KnowledgeStatus[]> = {
    draft: ["in_review", "archived"],
    in_review: ["approved", "draft", "archived"],
    approved: ["published", "archived"],
    published: ["archived"],
    archived: []
  };
  if (!allowed[from].includes(to)) {
    throw new KnowledgeError(`Cannot transition from ${from} to ${to}.`, "VALIDATION_FAILED");
  }
}

/** BE-KNW-004 — chunk + embed generation for a version (stub). */
export async function runChunkAndEmbedGeneration(options: {
  readonly repo: KnowledgeRepository;
  readonly tenantId: string;
  readonly versionId: string;
  readonly sourceType: KnowledgeSourceType;
  readonly uri: string | null;
  readonly bodyMarkdown: string | null;
  readonly effectiveFrom: string | null;
  readonly effectiveTo: string | null;
}): Promise<{ readonly chunkCount: number }> {
  const extracted = extractContentStub({
    sourceType: options.sourceType,
    uri: options.uri,
    bodyMarkdown: options.bodyMarkdown
  });
  const parts = generateChunksFromText(extracted);
  const chunks = parts.map((text, index) => ({
    chunkId: generateUuidV7(),
    chunkIndex: index,
    contentText: text,
    contentChecksum: computeContentChecksum(text),
    embeddingStub: generateEmbeddingStub(text),
    tokenCount: estimateTokenCount(text),
    effectiveFrom: options.effectiveFrom,
    effectiveTo: options.effectiveTo
  }));
  const version = await options.repo.getVersion({ tenantId: options.tenantId, versionId: options.versionId });
  if (!version) {
    throw new KnowledgeError("Version not found.", "RESOURCE_NOT_FOUND");
  }
  await options.repo.replaceChunks({
    tenantId: options.tenantId,
    sourceId: version.sourceId,
    versionId: options.versionId,
    chunks
  });
  return { chunkCount: chunks.length };
}

/** BE-KNW-006 — ingestion pipeline stub (extract → chunk → embed). */
export async function runIngestionPipeline(options: {
  readonly repo: KnowledgeRepository;
  readonly tenantId: string;
  readonly versionId: string;
  readonly sourceType: KnowledgeSourceType;
  readonly uri: string | null;
  readonly bodyMarkdown: string | null;
  readonly effectiveFrom: string | null;
  readonly effectiveTo: string | null;
}): Promise<KnowledgeVersionRecord> {
  await options.repo.setIngestionState({
    tenantId: options.tenantId,
    versionId: options.versionId,
    ingestionStatus: "running"
  });
  try {
    const { chunkCount } = await runChunkAndEmbedGeneration(options);
    return options.repo.setIngestionState({
      tenantId: options.tenantId,
      versionId: options.versionId,
      ingestionStatus: "completed",
      chunkCount,
      ingestionError: null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ingestion failed.";
    return options.repo.setIngestionState({
      tenantId: options.tenantId,
      versionId: options.versionId,
      ingestionStatus: "failed",
      ingestionError: message
    });
  }
}

/** BE-KNW-006 — retry failed ingestion (stub). */
export async function retryKnowledgeIngestion(options: {
  readonly repo: KnowledgeRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly versionId: string;
  readonly sourceType: KnowledgeSourceType;
  readonly uri: string | null;
  readonly bodyMarkdown: string | null;
  readonly effectiveFrom: string | null;
  readonly effectiveTo: string | null;
}): Promise<KnowledgeVersionRecord> {
  requireKnowledgePermission(options.actorPermissions, "knowledge.publish");
  const version = await options.repo.getVersion({ tenantId: options.tenantId, versionId: options.versionId });
  if (!version) {
    throw new KnowledgeError("Version not found.", "RESOURCE_NOT_FOUND");
  }
  if (version.ingestionStatus !== "failed") {
    throw new KnowledgeError("Ingestion is not in a failed state.", "VALIDATION_FAILED");
  }
  await options.repo.setIngestionState({
    tenantId: options.tenantId,
    versionId: options.versionId,
    ingestionStatus: "queued",
    retryCount: version.retryCount + 1,
    ingestionError: null
  });
  return runIngestionPipeline({
    repo: options.repo,
    tenantId: options.tenantId,
    versionId: options.versionId,
    sourceType: options.sourceType,
    uri: options.uri,
    bodyMarkdown: options.bodyMarkdown,
    effectiveFrom: options.effectiveFrom,
    effectiveTo: options.effectiveTo
  });
}

/** BE-KNW-006 — rebuild index stub (re-chunk published version). */
export async function rebuildKnowledgeIndex(options: {
  readonly repo: KnowledgeRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly versionId: string;
  readonly sourceType: KnowledgeSourceType;
  readonly uri: string | null;
  readonly bodyMarkdown: string | null;
  readonly effectiveFrom: string | null;
  readonly effectiveTo: string | null;
}): Promise<KnowledgeVersionRecord> {
  requireKnowledgePermission(options.actorPermissions, "knowledge.publish");
  const version = await options.repo.getVersion({ tenantId: options.tenantId, versionId: options.versionId });
  if (!version) {
    throw new KnowledgeError("Version not found.", "RESOURCE_NOT_FOUND");
  }
  if (version.status !== "published") {
    throw new KnowledgeError("Only published versions can be rebuilt.", "VALIDATION_FAILED");
  }
  return runIngestionPipeline({
    repo: options.repo,
    tenantId: options.tenantId,
    versionId: options.versionId,
    sourceType: options.sourceType,
    uri: options.uri,
    bodyMarkdown: options.bodyMarkdown,
    effectiveFrom: options.effectiveFrom,
    effectiveTo: options.effectiveTo
  });
}

/** BE-KNW-005 — published/effective-only retrieval (tenant-scoped). */
export async function searchPublishedKnowledge(options: {
  readonly repo: KnowledgeRepository;
  readonly tenantId: string;
  readonly query: string;
  readonly topK?: number;
}): Promise<readonly PublishedSearchHit[]> {
  const now = new Date().toISOString();
  const needle = options.query.trim().toLowerCase();
  if (!needle) return [];
  const topK = options.topK ?? 5;
  const chunks = await options.repo.listPublishedChunks(options.tenantId);
  const hits: PublishedSearchHit[] = [];
  for (const chunk of chunks) {
    if (chunk.effectiveFrom && chunk.effectiveFrom > now) continue;
    if (chunk.effectiveTo && chunk.effectiveTo <= now) continue;
    const haystack = chunk.contentText.toLowerCase();
    if (!haystack.includes(needle)) continue;
    const version = await options.repo.getVersion({ tenantId: options.tenantId, versionId: chunk.versionId });
    if (!version || version.status !== "published") continue;
    hits.push({
      chunkId: chunk.id,
      versionId: chunk.versionId,
      sourceId: chunk.sourceId,
      title: version.title,
      snippet: chunk.contentText.slice(0, 240),
      score: 1
    });
  }
  return hits.slice(0, topK);
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export async function listKnowledgeSources(options: {
  readonly repo: KnowledgeRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
}): Promise<{
  readonly data: readonly KnowledgeResource[];
  readonly page_info: { readonly next_cursor: null; readonly has_more: false };
  readonly meta: Record<string, never>;
}> {
  requireKnowledgePermission(options.actorPermissions, "knowledge.read");
  const sources = await options.repo.listSources(options.tenantId);
  const data = sources.map((s) => sourceToResource(s));
  return { data, page_info: { next_cursor: null, has_more: false }, meta: {} };
}

export async function createKnowledgeSource(options: {
  readonly repo: KnowledgeRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly name: string;
  readonly type: KnowledgeSourceType;
  readonly uri?: string | null;
}): Promise<{ readonly data: KnowledgeResource; readonly meta: Record<string, never> }> {
  requireKnowledgePermission(options.actorPermissions, "knowledge.write");
  const data = await withIdempotency(options.repo, options.tenantId, options.idempotencyKey, async () => {
    const name = options.name?.trim() ?? "";
    if (!name || name.length > 300) {
      throw new KnowledgeError("Invalid source name.", "VALIDATION_FAILED");
    }
    if (options.type === "url" && !options.uri?.trim()) {
      throw new KnowledgeError("uri is required for url sources.", "VALIDATION_FAILED");
    }
    const source = await options.repo.createSource({
      tenantId: options.tenantId,
      sourceId: generateUuidV7(),
      name,
      sourceType: options.type,
      uri: options.uri?.trim() ?? null,
      actorId: options.actorId
    });
    return sourceToResource(source);
  });
  return { data, meta: {} };
}

export async function getKnowledgeSource(options: {
  readonly repo: KnowledgeRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly sourceId: string;
}): Promise<{ readonly data: KnowledgeResource; readonly meta: Record<string, never> }> {
  requireKnowledgePermission(options.actorPermissions, "knowledge.read");
  const source = await options.repo.getSource({ tenantId: options.tenantId, sourceId: options.sourceId });
  if (!source) {
    throw new KnowledgeError("Source not found.", "RESOURCE_NOT_FOUND");
  }
  return { data: sourceToResource(source), meta: {} };
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

export async function createKnowledgeVersion(options: {
  readonly repo: KnowledgeRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly sourceId: string;
  readonly title: string;
  readonly bodyMarkdown?: string | null;
}): Promise<{ readonly data: KnowledgeResource; readonly meta: Record<string, never> }> {
  requireKnowledgePermission(options.actorPermissions, "knowledge.write");
  const data = await withIdempotency(options.repo, options.tenantId, options.idempotencyKey, async () => {
    const title = options.title?.trim() ?? "";
    if (!title || title.length > 500) {
      throw new KnowledgeError("Invalid version title.", "VALIDATION_FAILED");
    }
    if (options.bodyMarkdown != null && options.bodyMarkdown.length > 200000) {
      throw new KnowledgeError("body_markdown too long.", "VALIDATION_FAILED");
    }
    const source = await options.repo.getSource({ tenantId: options.tenantId, sourceId: options.sourceId });
    if (!source) {
      throw new KnowledgeError("Source not found.", "RESOURCE_NOT_FOUND");
    }
    const version = await options.repo.createVersion({
      tenantId: options.tenantId,
      versionId: generateUuidV7(),
      sourceId: options.sourceId,
      title,
      bodyMarkdown: options.bodyMarkdown ?? null,
      actorId: options.actorId
    });
    return versionToResource(version);
  });
  return { data, meta: {} };
}

export async function updateKnowledgeVersion(options: {
  readonly repo: KnowledgeRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly versionId: string;
  readonly expectedVersion: number;
  readonly title?: string | null;
  readonly bodyMarkdown?: string | null;
}): Promise<{ readonly data: KnowledgeResource; readonly meta: Record<string, never> }> {
  requireKnowledgePermission(options.actorPermissions, "knowledge.write");
  const current = await options.repo.getVersion({ tenantId: options.tenantId, versionId: options.versionId });
  if (!current) {
    throw new KnowledgeError("Version not found.", "RESOURCE_NOT_FOUND");
  }
  if (current.status !== "draft") {
    throw new KnowledgeError("Only draft versions can be updated.", "VALIDATION_FAILED");
  }
  if (options.title != null && (!options.title.trim() || options.title.length > 500)) {
    throw new KnowledgeError("Invalid version title.", "VALIDATION_FAILED");
  }
  const updated = await options.repo.updateVersion({
    tenantId: options.tenantId,
    versionId: options.versionId,
    expectedVersion: options.expectedVersion,
    title: options.title,
    bodyMarkdown: options.bodyMarkdown,
    actorId: options.actorId
  });
  return { data: versionToResource(updated), meta: {} };
}

export async function submitKnowledgeReview(options: {
  readonly repo: KnowledgeRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly versionId: string;
}): Promise<{ readonly data: KnowledgeResource; readonly meta: Record<string, never> }> {
  requireKnowledgePermission(options.actorPermissions, "knowledge.write");
  const data = await withIdempotency(options.repo, options.tenantId, options.idempotencyKey, async () => {
    const current = await options.repo.getVersion({ tenantId: options.tenantId, versionId: options.versionId });
    if (!current) {
      throw new KnowledgeError("Version not found.", "RESOURCE_NOT_FOUND");
    }
    assertTransition(current.status, "in_review");
    const source = await options.repo.getSource({ tenantId: options.tenantId, sourceId: current.sourceId });
    if (!source) {
      throw new KnowledgeError("Source not found.", "RESOURCE_NOT_FOUND");
    }
    const extracted = extractContentStub({
      sourceType: source.sourceType,
      uri: source.uri,
      bodyMarkdown: current.bodyMarkdown
    });
    if (!extracted.trim()) {
      throw new KnowledgeError("Content is required before review.", "VALIDATION_FAILED");
    }
    const checksum = computeContentChecksum(extracted);
    const updated = await options.repo.transitionVersion({
      tenantId: options.tenantId,
      versionId: options.versionId,
      expectedVersion: current.version,
      toStatus: "in_review",
      actorId: options.actorId,
      contentChecksum: checksum
    });
    return versionToResource(updated);
  });
  return { data, meta: {} };
}

export async function approveKnowledgeVersion(options: {
  readonly repo: KnowledgeRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly versionId: string;
}): Promise<{ readonly data: KnowledgeResource; readonly meta: Record<string, never> }> {
  requireKnowledgePermission(options.actorPermissions, "knowledge.approve");
  const data = await withIdempotency(options.repo, options.tenantId, options.idempotencyKey, async () => {
    const current = await options.repo.getVersion({ tenantId: options.tenantId, versionId: options.versionId });
    if (!current) {
      throw new KnowledgeError("Version not found.", "RESOURCE_NOT_FOUND");
    }
    assertTransition(current.status, "approved");
    if (!current.contentChecksum) {
      throw new KnowledgeError("Content checksum missing; submit review first.", "VALIDATION_FAILED");
    }
    const updated = await options.repo.transitionVersion({
      tenantId: options.tenantId,
      versionId: options.versionId,
      expectedVersion: current.version,
      toStatus: "approved",
      actorId: options.actorId,
      approvedBy: options.actorId
    });
    return versionToResource(updated);
  });
  return { data, meta: {} };
}

export async function publishKnowledgeVersion(options: {
  readonly repo: KnowledgeRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly versionId: string;
}): Promise<{
  readonly data: { readonly job_id: string; readonly status: JobResponseStatus; readonly status_url: string | null };
  readonly meta: Record<string, never>;
}> {
  requireKnowledgePermission(options.actorPermissions, "knowledge.publish");
  const data = await withJobIdempotency(options.repo, options.tenantId, options.idempotencyKey, async () => {
    const current = await options.repo.getVersion({ tenantId: options.tenantId, versionId: options.versionId });
    if (!current) {
      throw new KnowledgeError("Version not found.", "RESOURCE_NOT_FOUND");
    }
    assertTransition(current.status, "published");
    const source = await options.repo.getSource({ tenantId: options.tenantId, sourceId: current.sourceId });
    if (!source) {
      throw new KnowledgeError("Source not found.", "RESOURCE_NOT_FOUND");
    }
    await options.repo.archivePreviousPublished({
      tenantId: options.tenantId,
      sourceId: current.sourceId,
      exceptVersionId: current.id,
      actorId: options.actorId
    });
    const effectiveFrom = new Date().toISOString();
    await options.repo.transitionVersion({
      tenantId: options.tenantId,
      versionId: options.versionId,
      expectedVersion: current.version,
      toStatus: "published",
      actorId: options.actorId,
      publishedBy: options.actorId,
      effectiveFrom
    });
    await options.repo.setIngestionState({
      tenantId: options.tenantId,
      versionId: options.versionId,
      ingestionStatus: "queued"
    });
    const jobId = generateUuidV7();
    void runIngestionPipeline({
      repo: options.repo,
      tenantId: options.tenantId,
      versionId: options.versionId,
      sourceType: source.sourceType,
      uri: source.uri,
      bodyMarkdown: current.bodyMarkdown,
      effectiveFrom,
      effectiveTo: null
    });
    return {
      job_id: jobId,
      status: "queued" as const,
      status_url: `/api/v1/knowledge/versions/${options.versionId}/ingestion`
    };
  });
  return { data, meta: {} };
}

export async function archiveKnowledgeVersion(options: {
  readonly repo: KnowledgeRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey?: string | null;
  readonly versionId: string;
}): Promise<{ readonly data: KnowledgeResource; readonly meta: Record<string, never> }> {
  requireKnowledgePermission(options.actorPermissions, "knowledge.publish");
  const data = await withIdempotency(options.repo, options.tenantId, options.idempotencyKey, async () => {
    const current = await options.repo.getVersion({ tenantId: options.tenantId, versionId: options.versionId });
    if (!current) {
      throw new KnowledgeError("Version not found.", "RESOURCE_NOT_FOUND");
    }
    assertTransition(current.status, "archived");
    const updated = await options.repo.transitionVersion({
      tenantId: options.tenantId,
      versionId: options.versionId,
      expectedVersion: current.version,
      toStatus: "archived",
      actorId: options.actorId
    });
    return versionToResource(updated);
  });
  return { data, meta: {} };
}

export async function getKnowledgeIngestion(options: {
  readonly repo: KnowledgeRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly versionId: string;
}): Promise<{
  readonly data: KnowledgeResource;
  readonly meta: {
    readonly ingestion_status: IngestionStatus;
    readonly chunk_count: number;
    readonly retry_count: number;
    readonly last_error: string | null;
  };
}> {
  requireKnowledgePermission(options.actorPermissions, "knowledge.read");
  const version = await options.repo.getVersion({ tenantId: options.tenantId, versionId: options.versionId });
  if (!version) {
    throw new KnowledgeError("Version not found.", "RESOURCE_NOT_FOUND");
  }
  return {
    data: versionToResource(version),
    meta: {
      ingestion_status: version.ingestionStatus,
      chunk_count: version.chunkCount,
      retry_count: version.retryCount,
      last_error: version.ingestionError
    }
  };
}

export async function testKnowledgeSearch(options: {
  readonly repo: KnowledgeRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly query: string;
  readonly topK?: number;
}): Promise<{
  readonly data: KnowledgeResource;
  readonly meta: { readonly hits: readonly PublishedSearchHit[]; readonly query: string };
}> {
  requireKnowledgePermission(options.actorPermissions, "knowledge.read");
  const query = options.query?.trim() ?? "";
  if (!query || query.length > 2000) {
    throw new KnowledgeError("Invalid search query.", "VALIDATION_FAILED");
  }
  const hits = await searchPublishedKnowledge({
    repo: options.repo,
    tenantId: options.tenantId,
    query,
    ...(options.topK !== undefined ? { topK: options.topK } : {})
  });
  if (hits.length === 0) {
    throw new KnowledgeError("No published knowledge matched the query.", "RESOURCE_NOT_FOUND");
  }
  const top = hits[0]!;
  const version = await options.repo.getVersion({ tenantId: options.tenantId, versionId: top.versionId });
  if (!version) {
    throw new KnowledgeError("Version not found.", "RESOURCE_NOT_FOUND");
  }
  return {
    data: versionToResource(version),
    meta: { hits, query }
  };
}

export function parseIfMatchVersion(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^"?v(\d+)"?$/.exec(value.trim());
  return match?.[1] ? Number(match[1]) : null;
}
