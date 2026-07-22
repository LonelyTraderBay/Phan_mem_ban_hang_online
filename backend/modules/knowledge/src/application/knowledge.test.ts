import { describe, expect, it } from "vitest";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import {
  approveKnowledgeVersion,
  archiveKnowledgeVersion,
  computeContentChecksum,
  createKnowledgeSource,
  createKnowledgeVersion,
  extractContentStub,
  generateChunksFromText,
  generateEmbeddingStub,
  getKnowledgeIngestion,
  listKnowledgeSources,
  publishKnowledgeVersion,
  rebuildKnowledgeIndex,
  retryKnowledgeIngestion,
  runChunkAndEmbedGeneration,
  runIngestionPipeline,
  searchPublishedKnowledge,
  submitKnowledgeReview,
  testKnowledgeSearch,
  updateKnowledgeVersion
} from "./knowledge.js";
import { InMemoryKnowledgeRepository } from "../infrastructure/persistence/in-memory-knowledge.js";

const tenantA = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d1b");
const tenantB = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d2b");
const actorId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7d3b");

const readPerms = ["knowledge.read"];
const writePerms = ["knowledge.read", "knowledge.write"];
const approvePerms = ["knowledge.read", "knowledge.write", "knowledge.approve"];
const publishPerms = ["knowledge.read", "knowledge.write", "knowledge.approve", "knowledge.publish"];

function seed() {
  return new InMemoryKnowledgeRepository();
}

async function publishReadyVersion(repo: InMemoryKnowledgeRepository, body = "Return policy allows 7-day refunds.") {
  const source = await createKnowledgeSource({
    repo,
    tenantId: tenantA,
    actorId,
    actorPermissions: writePerms,
    idempotencyKey: "src-1",
    name: "Policies",
    type: "manual"
  });
  const version = await createKnowledgeVersion({
    repo,
    tenantId: tenantA,
    actorId,
    actorPermissions: writePerms,
    idempotencyKey: "ver-1",
    sourceId: source.data.id,
    title: "Return policy",
    bodyMarkdown: body
  });
  await submitKnowledgeReview({
    repo,
    tenantId: tenantA,
    actorId,
    actorPermissions: writePerms,
    idempotencyKey: "review-1",
    versionId: version.data.id
  });
  await approveKnowledgeVersion({
    repo,
    tenantId: tenantA,
    actorId,
    actorPermissions: approvePerms,
    idempotencyKey: "approve-1",
    versionId: version.data.id
  });
  await publishKnowledgeVersion({
    repo,
    tenantId: tenantA,
    actorId,
    actorPermissions: publishPerms,
    idempotencyKey: "publish-1",
    versionId: version.data.id
  });
  await runIngestionPipeline({
    repo,
    tenantId: tenantA,
    versionId: version.data.id,
    sourceType: "manual",
    uri: null,
    bodyMarkdown: body,
    effectiveFrom: new Date().toISOString(),
    effectiveTo: null
  });
  return { source, version };
}

describe("BE-KNW-003 extraction + checksum stubs", () => {
  it("computes stable sha256 checksum and extracts url/upload placeholders", () => {
    const text = "Hello knowledge";
    expect(computeContentChecksum(text)).toHaveLength(64);
    expect(computeContentChecksum(text)).toBe(computeContentChecksum(text));
    expect(extractContentStub({ sourceType: "url", uri: "https://example.com/faq", bodyMarkdown: null })).toContain(
      "https://example.com/faq"
    );
    expect(extractContentStub({ sourceType: "upload", uri: null, bodyMarkdown: null })).toContain("upload");
  });
});

describe("BE-KNW-004 chunk/embed stubs", () => {
  it("splits paragraphs and returns deterministic embedding stub", () => {
    const chunks = generateChunksFromText("Part A\n\nPart B");
    expect(chunks).toEqual(["Part A", "Part B"]);
    const embed = generateEmbeddingStub("Part A");
    expect(embed).toMatchObject({ stub: true, model: "stub-v1" });
  });
});

describe("BE-KNW-002 knowledge lifecycle", () => {
  it("happy path: create source/version and transition through publish", async () => {
    const repo = seed();
    const { version } = await publishReadyVersion(repo);
    const ingestion = await getKnowledgeIngestion({
      repo,
      tenantId: tenantA,
      actorPermissions: readPerms,
      versionId: version.data.id
    });
    expect(ingestion.data.status).toBe("published");
    expect(ingestion.meta.ingestion_status).toBe("completed");
    expect(ingestion.meta.chunk_count).toBeGreaterThan(0);
  });

  it("knowledge.write permission enforced", async () => {
    const repo = seed();
    await expect(
      createKnowledgeSource({
        repo,
        tenantId: tenantA,
        actorId,
        actorPermissions: readPerms,
        idempotencyKey: "deny",
        name: "Denied",
        type: "manual"
      })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_PERMISSION" });
  });

  it("draft-only update and invalid transition rejected", async () => {
    const repo = seed();
    const source = await createKnowledgeSource({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: writePerms,
      idempotencyKey: "src-2",
      name: "FAQ",
      type: "manual"
    });
    const version = await createKnowledgeVersion({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: writePerms,
      idempotencyKey: "ver-2",
      sourceId: source.data.id,
      title: "Draft",
      bodyMarkdown: "Content"
    });
    await submitKnowledgeReview({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: writePerms,
      idempotencyKey: "review-2",
      versionId: version.data.id
    });
    await expect(
      updateKnowledgeVersion({
        repo,
        tenantId: tenantA,
        actorId,
        actorPermissions: writePerms,
        versionId: version.data.id,
        expectedVersion: 2,
        title: "Nope"
      })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("tenant isolation on list sources", async () => {
    const repo = seed();
    await createKnowledgeSource({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: writePerms,
      idempotencyKey: "iso-a",
      name: "Tenant A doc",
      type: "manual"
    });
    const listedB = await listKnowledgeSources({ repo, tenantId: tenantB, actorPermissions: readPerms });
    expect(listedB.data).toHaveLength(0);
    const listedA = await listKnowledgeSources({ repo, tenantId: tenantA, actorPermissions: readPerms });
    expect(listedA.data).toHaveLength(1);
  });

  it("archive published version", async () => {
    const repo = seed();
    const { version } = await publishReadyVersion(repo);
    const archived = await archiveKnowledgeVersion({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: publishPerms,
      idempotencyKey: "archive-1",
      versionId: version.data.id
    });
    expect(archived.data.status).toBe("archived");
  });
});

describe("BE-KNW-005 published retrieval", () => {
  it("returns only published/effective chunks for tenant", async () => {
    const repo = seed();
    await publishReadyVersion(repo, "Shipping is free over 500k VND.");
    const hits = await searchPublishedKnowledge({
      repo,
      tenantId: tenantA,
      query: "shipping"
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.snippet.toLowerCase()).toContain("shipping");

    const otherTenantHits = await searchPublishedKnowledge({
      repo,
      tenantId: tenantB,
      query: "shipping"
    });
    expect(otherTenantHits).toEqual([]);
  });

  it("testKnowledgeSearch returns top published match", async () => {
    const repo = seed();
    await publishReadyVersion(repo, "Warranty lasts 12 months.");
    const result = await testKnowledgeSearch({
      repo,
      tenantId: tenantA,
      actorPermissions: readPerms,
      query: "warranty"
    });
    expect(result.data.status).toBe("published");
    expect(result.meta.hits.length).toBeGreaterThan(0);
  });
});

describe("BE-KNW-006 ingestion health/retry/rebuild stubs", () => {
  it("runChunkAndEmbedGeneration writes chunks", async () => {
    const repo = seed();
    const source = await createKnowledgeSource({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: writePerms,
      idempotencyKey: "chunk-src",
      name: "Chunk test",
      type: "manual"
    });
    const version = await createKnowledgeVersion({
      repo,
      tenantId: tenantA,
      actorId,
      actorPermissions: writePerms,
      idempotencyKey: "chunk-ver",
      sourceId: source.data.id,
      title: "Chunk version",
      bodyMarkdown: "Alpha\n\nBeta"
    });
    const { chunkCount } = await runChunkAndEmbedGeneration({
      repo,
      tenantId: tenantA,
      versionId: version.data.id,
      sourceType: "manual",
      uri: null,
      bodyMarkdown: "Alpha\n\nBeta",
      effectiveFrom: null,
      effectiveTo: null
    });
    expect(chunkCount).toBe(2);
  });

  it("retry and rebuild stubs operate on ingestion state", async () => {
    const repo = seed();
    const { version } = await publishReadyVersion(repo, "Retry content sample.");
    const current = await repo.getVersion({ tenantId: tenantA, versionId: version.data.id });
    await repo.setIngestionState({
      tenantId: tenantA,
      versionId: version.data.id,
      ingestionStatus: "failed",
      ingestionError: "stub failure"
    });
    const retried = await retryKnowledgeIngestion({
      repo,
      tenantId: tenantA,
      actorPermissions: publishPerms,
      versionId: version.data.id,
      sourceType: "manual",
      uri: null,
      bodyMarkdown: current?.bodyMarkdown ?? null,
      effectiveFrom: current?.effectiveFrom ?? null,
      effectiveTo: null
    });
    expect(retried.ingestionStatus).toBe("completed");
    expect(retried.retryCount).toBeGreaterThan(0);

    const rebuilt = await rebuildKnowledgeIndex({
      repo,
      tenantId: tenantA,
      actorPermissions: publishPerms,
      versionId: version.data.id,
      sourceType: "manual",
      uri: null,
      bodyMarkdown: current?.bodyMarkdown ?? null,
      effectiveFrom: current?.effectiveFrom ?? null,
      effectiveTo: null
    });
    expect(rebuilt.ingestionStatus).toBe("completed");
  });
});
