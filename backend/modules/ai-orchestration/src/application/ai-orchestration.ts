import { generateUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import {
  DEFAULT_BUDGET,
  DEFAULT_SWITCH,
  assertAiEnabled,
  checkBudget,
  type TenantAiBudget,
  type TenantAiSwitchState
} from "../domain/budget-switches.js";
import { buildConfigBundle } from "../domain/config-version.js";
import { buildAiContext } from "../domain/context-builder.js";
import { StubIntentClassifier } from "../domain/classifier.js";
import { enforceAiRules, mapViolationToErrorCode } from "../domain/ai-rules.js";
import { buildAiQualityDashboard, toAnalyticsReport } from "../domain/dashboard.js";
import { meetsReleaseThreshold, runEvalStub } from "../domain/eval-runner.js";
import { nextPromptStatus } from "../domain/config-version.js";
import { validateClaims, validateOutputText } from "../domain/qc-validators.js";
import { repairSuggestionOutput } from "../domain/suggestion-schema.js";
import { evaluateToolPolicy, invokeToolStub } from "../domain/tool-registry.js";
import type { KnowledgeRetrievalPort } from "../infrastructure/clients/knowledge-retrieval.js";
import {
  StubModelGateway,
  withTimeout,
  type ModelGatewayPort
} from "../infrastructure/gateway/model-gateway.js";
import type {
  AiLogRecord,
  AiOrchestrationRepository,
  BlockedOutputRecord,
  EvalRunRecord,
  PromptVersionRecord,
  SuggestionRecord
} from "../infrastructure/persistence/in-memory-ai-orchestration.js";

/**
 * BE-AI-001…016 — AI orchestration application layer (in-memory until Postgres adapter).
 */

export type AiPermission =
  | "ai.use"
  | "ai.review"
  | "ai.configure"
  | "ai.activate"
  | "ai.disable"
  | "ai.sandbox.test"
  | "conversation.reply"
  | "report.ai_quality.read";

export type AiErrorCode =
  | "VALIDATION_FAILED"
  | "INSUFFICIENT_PERMISSION"
  | "RESOURCE_NOT_FOUND"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "AI_DISABLED"
  | "AI_BUDGET_EXCEEDED"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_OUTPUT_INVALID"
  | "AI_OUTPUT_BLOCKED"
  | "AI_APPROVAL_REQUIRED"
  | "AI_SOURCE_REQUIRED"
  | "AI_SOURCE_STALE"
  | "AI_PROMPT_VERSION_NOT_APPROVED"
  | "AI_EVALUATION_FAILED"
  | "AI_TOOL_NOT_ALLOWED"
  | "AI_TOOL_FAILED"
  | "CONVERSATION_STATE_INVALID";

export class AiOrchestrationError extends Error {
  constructor(
    message: string,
    readonly code: AiErrorCode
  ) {
    super(message);
    this.name = "AiOrchestrationError";
  }
}

export interface ConversationLookupPort {
  conversationExists(args: { readonly tenantId: string; readonly conversationId: string }): Promise<boolean>;
}

export interface OutboundSendPort {
  queueSuggestionSend(args: {
    readonly tenantId: string;
    readonly actorId: string;
    readonly conversationId: string;
    readonly suggestionId: string;
    readonly text: string;
    readonly idempotencyKey: string;
  }): Promise<{ readonly jobId: string; readonly status: string }>;
}

function emptyPage() {
  return { next_cursor: null as null, has_more: false as const };
}

function toAiResource(record: {
  readonly id: string;
  readonly tenantId: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt?: string;
}) {
  return {
    id: record.id,
    tenant_id: record.tenantId,
    status: record.status,
    created_at: record.createdAt,
    updated_at: record.updatedAt ?? record.createdAt
  };
}

export function requireAiPermission(
  actorPermissions: readonly string[],
  permission: AiPermission
): void {
  if (!actorPermissions.includes(permission)) {
    throw new AiOrchestrationError("Permission denied.", "INSUFFICIENT_PERMISSION");
  }
}

async function ensureAiOperational(repo: AiOrchestrationRepository, tenantId: string): Promise<void> {
  const sw = await repo.getTenantSwitch(tenantId);
  const enabled = assertAiEnabled(sw);
  if (!enabled.ok) {
    throw new AiOrchestrationError("AI is disabled for tenant.", enabled.code as AiErrorCode);
  }
  const budget = await repo.getTenantBudget(tenantId);
  const budgetOk = checkBudget(budget);
  if (!budgetOk.ok) {
    throw new AiOrchestrationError("AI budget exceeded.", budgetOk.code as AiErrorCode);
  }
}

async function incrementBudget(repo: AiOrchestrationRepository, tenantId: string, tokens: number): Promise<void> {
  const budget = await repo.getTenantBudget(tenantId);
  await repo.updateTenantBudget(tenantId, {
    ...budget,
    usedToday: budget.usedToday + 1,
    tokensUsed: budget.tokensUsed + tokens,
    activeJobs: Math.max(0, budget.activeJobs)
  });
}

export async function createAISuggestion(options: {
  readonly repo: AiOrchestrationRepository;
  readonly conversations: ConversationLookupPort;
  readonly knowledge: KnowledgeRetrievalPort;
  readonly gateway?: ModelGatewayPort;
  readonly classifier?: StubIntentClassifier;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly conversationId: string;
  readonly messageId?: string | null;
  readonly mode?: "copilot" | "semi_auto" | "autopilot";
  readonly userPrompt?: string;
}): Promise<{ readonly data: { readonly job_id: string; readonly status: string }; readonly meta: Record<string, never> }> {
  requireAiPermission(options.actorPermissions, "ai.use");
  if (!options.idempotencyKey?.trim()) {
    throw new AiOrchestrationError("Idempotency-Key required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  await ensureAiOperational(options.repo, options.tenantId);

  const existing = await options.repo.getIdempotentJob(options.tenantId, options.idempotencyKey);
  if (existing) {
    return { data: { job_id: existing.jobId, status: "queued" }, meta: {} };
  }

  const exists = await options.conversations.conversationExists({
    tenantId: options.tenantId,
    conversationId: options.conversationId
  });
  if (!exists) {
    throw new AiOrchestrationError("Conversation not found.", "RESOURCE_NOT_FOUND");
  }

  const suggestionId = generateUuidV7();
  const now = new Date().toISOString();
  const mode = options.mode ?? "copilot";
  const activePrompt = await options.repo.getActivePromptVersion(options.tenantId);

  const suggestion: SuggestionRecord = {
    id: suggestionId,
    tenantId: options.tenantId,
    conversationId: options.conversationId,
    messageId: options.messageId ?? null,
    mode,
    status: "generating",
    outputRedacted: null,
    promptVersionId: activePrompt?.id ?? null,
    createdAt: now,
    updatedAt: now
  };
  await options.repo.createSuggestion(suggestion);
  await options.repo.rememberIdempotentJob(options.tenantId, options.idempotencyKey, suggestionId);

  const userPrompt = options.userPrompt ?? "Generate helpful sales reply.";
  const classifier = options.classifier ?? new StubIntentClassifier();
  const classification = await classifier.classify(userPrompt);
  const hits = await options.knowledge.search({
    tenantId: options.tenantId,
    query: userPrompt,
    topK: 3
  });
  const context = buildAiContext({
    systemPrompt: activePrompt?.content ?? "You are a helpful sales assistant.",
    trustedFacts: hits.map((h) => `${h.title}: ${h.snippet}`),
    untrustedMessages: [userPrompt]
  });

  const gateway = options.gateway ?? new StubModelGateway();
  const config = buildConfigBundle({ promptVersionId: activePrompt?.id ?? "default" });

  let completion;
  try {
    completion = await withTimeout(
      gateway.complete({
        systemPrompt: context.segments.map((s) => s.content).join("\n\n"),
        userPrompt,
        maxTokens: 512
      }),
      30_000
    );
  } catch {
    throw new AiOrchestrationError("AI provider unavailable.", "AI_PROVIDER_UNAVAILABLE");
  }

  const suggestionParsed = repairSuggestionOutput(completion.text);
  const qcText = validateOutputText(suggestionParsed?.replyText ?? "");
  const qcClaims = validateClaims(suggestionParsed?.claims ?? [], []);
  const qc = {
    passed: qcText.passed && qcClaims.passed,
    violations: [...qcText.violations, ...qcClaims.violations]
  };

  const enforcement = enforceAiRules({
    tenantId: options.tenantId,
    requestTenantId: options.tenantId,
    suggestion: suggestionParsed,
    classifier: classification,
    qc,
    toolCount: suggestionParsed?.toolCalls.length ?? 0,
    tokenBudgetRemaining: 1000
  });

  const logId = generateUuidV7();
  const log: AiLogRecord = {
    id: logId,
    tenantId: options.tenantId,
    conversationId: options.conversationId,
    suggestionId,
    requestType: "suggestion",
    status: enforcement.blocked ? "blocked" : "completed",
    promptVersionId: config.promptVersionId,
    modelProvider: completion.provider,
    tokensUsed: completion.tokensUsed,
    latencyMs: completion.latencyMs,
    correlationId: null,
    createdAt: now
  };
  await options.repo.createLog(log);

  if (enforcement.blocked) {
    const blocked: BlockedOutputRecord = {
      id: generateUuidV7(),
      tenantId: options.tenantId,
      suggestionId,
      ruleId: enforcement.violations[0]?.ruleId ?? "AI-R005",
      severity: enforcement.violations[0]?.severity ?? "high",
      evidenceHash: "stub-hash",
      safeFallback: enforcement.safeFallback,
      createdAt: now
    };
    await options.repo.createBlockedOutput(blocked);
    await options.repo.updateSuggestion({
      ...suggestion,
      status: "blocked",
      outputRedacted: enforcement.safeFallback,
      updatedAt: new Date().toISOString()
    });
    throw new AiOrchestrationError(
      "AI output blocked by safety rules.",
      mapViolationToErrorCode(enforcement.violations) as AiErrorCode
    );
  }

  if (!suggestionParsed) {
    throw new AiOrchestrationError("AI output invalid.", "AI_OUTPUT_INVALID");
  }

  const toolPolicy = evaluateToolPolicy({
    toolName: "conversation.queue_reply",
    actorPermissions: options.actorPermissions,
    aiMode: mode
  });
  if (toolPolicy.decision === "deny") {
    throw new AiOrchestrationError("AI tool not allowed.", "AI_TOOL_NOT_ALLOWED");
  }

  await options.repo.updateSuggestion({
    ...suggestion,
    status: toolPolicy.decision === "require_approval" ? "pending_review" : "approved",
    outputRedacted: suggestionParsed.replyText,
    updatedAt: new Date().toISOString()
  });
  await incrementBudget(options.repo, options.tenantId, completion.tokensUsed);

  return { data: { job_id: suggestionId, status: "queued" }, meta: {} };
}

export async function listConversationAISuggestions(options: {
  readonly repo: AiOrchestrationRepository;
  readonly tenantId: string;
  readonly conversationId: string;
  readonly actorPermissions: readonly string[];
}) {
  requireAiPermission(options.actorPermissions, "ai.use");
  const rows = await options.repo.listSuggestionsByConversation({
    tenantId: options.tenantId,
    conversationId: options.conversationId
  });
  return { data: rows.map(toAiResource), page_info: emptyPage(), meta: {} };
}

export async function approveAISuggestion(options: {
  readonly repo: AiOrchestrationRepository;
  readonly tenantId: string;
  readonly conversationId: string;
  readonly suggestionId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
}) {
  requireAiPermission(options.actorPermissions, "ai.review");
  if (!options.idempotencyKey?.trim()) {
    throw new AiOrchestrationError("Idempotency-Key required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const row = await options.repo.getSuggestion({
    tenantId: options.tenantId,
    suggestionId: options.suggestionId
  });
  if (!row || row.conversationId !== options.conversationId) {
    throw new AiOrchestrationError("Suggestion not found.", "RESOURCE_NOT_FOUND");
  }
  if (row.status !== "pending_review" && row.status !== "generating") {
    throw new AiOrchestrationError("Suggestion state invalid.", "VALIDATION_FAILED");
  }
  const updated = await options.repo.updateSuggestion({
    ...row,
    status: "approved",
    updatedAt: new Date().toISOString()
  });
  return { data: toAiResource(updated), meta: {} };
}

export async function sendAISuggestion(options: {
  readonly repo: AiOrchestrationRepository;
  readonly outbound: OutboundSendPort;
  readonly tenantId: string;
  readonly actorId: string;
  readonly conversationId: string;
  readonly suggestionId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
}) {
  requireAiPermission(options.actorPermissions, "conversation.reply");
  if (!options.idempotencyKey?.trim()) {
    throw new AiOrchestrationError("Idempotency-Key required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  await ensureAiOperational(options.repo, options.tenantId);
  const row = await options.repo.getSuggestion({
    tenantId: options.tenantId,
    suggestionId: options.suggestionId
  });
  if (!row || row.conversationId !== options.conversationId) {
    throw new AiOrchestrationError("Suggestion not found.", "RESOURCE_NOT_FOUND");
  }
  if (row.status !== "approved") {
    throw new AiOrchestrationError("Suggestion requires approval.", "AI_APPROVAL_REQUIRED");
  }
  if (!row.outputRedacted) {
    throw new AiOrchestrationError("Suggestion has no output.", "VALIDATION_FAILED");
  }
  const job = await options.outbound.queueSuggestionSend({
    tenantId: options.tenantId,
    actorId: options.actorId,
    conversationId: options.conversationId,
    suggestionId: options.suggestionId,
    text: row.outputRedacted,
    idempotencyKey: options.idempotencyKey
  });
  if (job.status !== "queued") {
    throw new AiOrchestrationError(
      `Outbound queue rejected send (status=${job.status}).`,
      "VALIDATION_FAILED"
    );
  }
  await options.repo.updateSuggestion({
    ...row,
    status: "sent",
    updatedAt: new Date().toISOString()
  });
  return { data: { job_id: job.jobId, status: "queued" as const }, meta: {} };
}

export async function evaluateAIResponse(options: {
  readonly repo: AiOrchestrationRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly suggestionId?: string;
}) {
  requireAiPermission(options.actorPermissions, "ai.review");
  if (!options.idempotencyKey?.trim()) {
    throw new AiOrchestrationError("Idempotency-Key required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const log = (await options.repo.listLogs(options.tenantId))[0];
  if (!log) {
    throw new AiOrchestrationError("AI log not found.", "RESOURCE_NOT_FOUND");
  }
  return { data: toAiResource({ ...log, status: log.status }), meta: {} };
}

export async function testAIMessage(options: {
  readonly repo: AiOrchestrationRepository;
  readonly gateway?: ModelGatewayPort;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly message?: string;
}) {
  requireAiPermission(options.actorPermissions, "ai.sandbox.test");
  if (!options.idempotencyKey?.trim()) {
    throw new AiOrchestrationError("Idempotency-Key required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  await ensureAiOperational(options.repo, options.tenantId);
  const gateway = options.gateway ?? new StubModelGateway();
  const completion = await gateway.complete({
    systemPrompt: "Sandbox mode — no production send.",
    userPrompt: options.message ?? "Test message",
    maxTokens: 128
  });
  const parsed = repairSuggestionOutput(completion.text);
  const id = generateUuidV7();
  const now = new Date().toISOString();
  await options.repo.createLog({
    id,
    tenantId: options.tenantId,
    conversationId: null,
    suggestionId: null,
    requestType: "sandbox",
    status: "completed",
    promptVersionId: null,
    modelProvider: completion.provider,
    tokensUsed: completion.tokensUsed,
    latencyMs: completion.latencyMs,
    correlationId: null,
    createdAt: now
  });
  return {
    data: toAiResource({
      id,
      tenantId: options.tenantId,
      status: parsed ? "completed" : "failed",
      createdAt: now
    }),
    meta: {}
  };
}

export async function listAILogs(options: {
  readonly repo: AiOrchestrationRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
}) {
  requireAiPermission(options.actorPermissions, "ai.review");
  const rows = await options.repo.listLogs(options.tenantId);
  return { data: rows.map((r) => toAiResource(r)), page_info: emptyPage(), meta: {} };
}

export async function getAILog(options: {
  readonly repo: AiOrchestrationRepository;
  readonly tenantId: string;
  readonly logId: string;
  readonly actorPermissions: readonly string[];
}) {
  requireAiPermission(options.actorPermissions, "ai.review");
  const row = await options.repo.getLog({ tenantId: options.tenantId, logId: options.logId });
  if (!row) throw new AiOrchestrationError("AI log not found.", "RESOURCE_NOT_FOUND");
  return { data: toAiResource(row), meta: {} };
}

export async function listAIBlockedOutputs(options: {
  readonly repo: AiOrchestrationRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
}) {
  requireAiPermission(options.actorPermissions, "ai.review");
  const rows = await options.repo.listBlockedOutputs(options.tenantId);
  return {
    data: rows.map((r) => toAiResource({ ...r, status: r.severity })),
    page_info: emptyPage(),
    meta: {}
  };
}

export async function listPromptVersions(options: {
  readonly repo: AiOrchestrationRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
}) {
  requireAiPermission(options.actorPermissions, "ai.configure");
  const rows = await options.repo.listPromptVersions(options.tenantId);
  return { data: rows.map(toAiResource), page_info: emptyPage(), meta: {} };
}

export async function createPromptVersion(options: {
  readonly repo: AiOrchestrationRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
  readonly name: string;
  readonly content: string;
  readonly riskLevel?: "low" | "medium" | "high";
}) {
  requireAiPermission(options.actorPermissions, "ai.configure");
  if (!options.idempotencyKey?.trim()) {
    throw new AiOrchestrationError("Idempotency-Key required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  if (!options.name.trim() || !options.content.trim()) {
    throw new AiOrchestrationError("name and content required.", "VALIDATION_FAILED");
  }
  const now = new Date().toISOString();
  const record: PromptVersionRecord = {
    id: generateUuidV7(),
    tenantId: options.tenantId,
    name: options.name.trim(),
    content: options.content.trim(),
    riskLevel: options.riskLevel ?? "medium",
    status: "draft",
    version: 1,
    createdAt: now,
    updatedAt: now
  };
  await options.repo.createPromptVersion(record);
  return { data: toAiResource(record), meta: {} };
}

export async function runPromptEvaluation(options: {
  readonly repo: AiOrchestrationRepository;
  readonly tenantId: string;
  readonly promptVersionId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
}) {
  requireAiPermission(options.actorPermissions, "ai.configure");
  if (!options.idempotencyKey?.trim()) {
    throw new AiOrchestrationError("Idempotency-Key required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const prompt = await options.repo.getPromptVersion({
    tenantId: options.tenantId,
    promptVersionId: options.promptVersionId
  });
  if (!prompt) throw new AiOrchestrationError("Prompt version not found.", "RESOURCE_NOT_FOUND");

  const runId = generateUuidV7();
  const now = new Date().toISOString();
  const result = runEvalStub({ runId, promptVersionId: options.promptVersionId });
  const run: EvalRunRecord = {
    id: runId,
    tenantId: options.tenantId,
    promptVersionId: options.promptVersionId,
    status: "completed",
    passed: result.passed,
    criticalViolations: result.criticalViolations,
    totalCases: result.totalCases,
    createdAt: now,
    updatedAt: now
  };
  await options.repo.createEvalRun(run);
  await options.repo.updatePromptVersion({
    ...prompt,
    status: nextPromptStatus(prompt.status, "submit_eval"),
    updatedAt: now
  });
  return { data: { job_id: runId, status: "queued" as const }, meta: {} };
}

export async function getEvaluationRun(options: {
  readonly repo: AiOrchestrationRepository;
  readonly tenantId: string;
  readonly runId: string;
  readonly actorPermissions: readonly string[];
}) {
  requireAiPermission(options.actorPermissions, "ai.review");
  const run = await options.repo.getEvalRun({ tenantId: options.tenantId, runId: options.runId });
  if (!run) throw new AiOrchestrationError("Evaluation run not found.", "RESOURCE_NOT_FOUND");
  return { data: toAiResource({ ...run, status: run.passed ? "passed" : "failed" }), meta: {} };
}

export async function approvePromptVersion(options: {
  readonly repo: AiOrchestrationRepository;
  readonly tenantId: string;
  readonly promptVersionId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
}) {
  requireAiPermission(options.actorPermissions, "ai.activate");
  if (!options.idempotencyKey?.trim()) {
    throw new AiOrchestrationError("Idempotency-Key required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const prompt = await options.repo.getPromptVersion({
    tenantId: options.tenantId,
    promptVersionId: options.promptVersionId
  });
  if (!prompt) throw new AiOrchestrationError("Prompt version not found.", "RESOURCE_NOT_FOUND");
  const runs = await options.repo.getEvalRun({ tenantId: options.tenantId, runId: prompt.id });
  void runs;
  const updated = await options.repo.updatePromptVersion({
    ...prompt,
    status: nextPromptStatus(prompt.status, "approve"),
    updatedAt: new Date().toISOString()
  });
  return { data: toAiResource(updated), meta: {} };
}

export async function activatePromptVersion(options: {
  readonly repo: AiOrchestrationRepository;
  readonly tenantId: string;
  readonly promptVersionId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
}) {
  requireAiPermission(options.actorPermissions, "ai.activate");
  if (!options.idempotencyKey?.trim()) {
    throw new AiOrchestrationError("Idempotency-Key required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const prompt = await options.repo.getPromptVersion({
    tenantId: options.tenantId,
    promptVersionId: options.promptVersionId
  });
  if (!prompt) throw new AiOrchestrationError("Prompt version not found.", "RESOURCE_NOT_FOUND");
  if (prompt.status !== "approved" && prompt.status !== "active") {
    throw new AiOrchestrationError("Prompt not approved.", "AI_PROMPT_VERSION_NOT_APPROVED");
  }
  const all = await options.repo.listPromptVersions(options.tenantId);
  for (const p of all) {
    if (p.status === "active" && p.id !== prompt.id) {
      await options.repo.updatePromptVersion({
        ...p,
        status: "retired",
        updatedAt: new Date().toISOString()
      });
    }
  }
  const updated = await options.repo.updatePromptVersion({
    ...prompt,
    status: "active",
    updatedAt: new Date().toISOString()
  });
  return { data: toAiResource(updated), meta: {} };
}

export async function rollbackPromptVersion(options: {
  readonly repo: AiOrchestrationRepository;
  readonly tenantId: string;
  readonly promptVersionId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
}) {
  requireAiPermission(options.actorPermissions, "ai.activate");
  if (!options.idempotencyKey?.trim()) {
    throw new AiOrchestrationError("Idempotency-Key required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const prompt = await options.repo.getPromptVersion({
    tenantId: options.tenantId,
    promptVersionId: options.promptVersionId
  });
  if (!prompt) throw new AiOrchestrationError("Prompt version not found.", "RESOURCE_NOT_FOUND");
  const updated = await options.repo.updatePromptVersion({
    ...prompt,
    status: nextPromptStatus(prompt.status, "rollback"),
    updatedAt: new Date().toISOString()
  });
  return { data: toAiResource(updated), meta: {} };
}

export async function disableAI(options: {
  readonly repo: AiOrchestrationRepository;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
}) {
  requireAiPermission(options.actorPermissions, "ai.disable");
  if (!options.idempotencyKey?.trim()) {
    throw new AiOrchestrationError("Idempotency-Key required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const now = new Date().toISOString();
  const state: TenantAiSwitchState = {
    disabled: true,
    disabledAt: now,
    disabledBy: options.actorId,
    fallbackMode: "deterministic"
  };
  await options.repo.setTenantSwitch(options.tenantId, state);
  return {
    data: toAiResource({
      id: options.tenantId,
      tenantId: options.tenantId,
      status: "disabled",
      createdAt: now
    }),
    meta: {}
  };
}

export async function enableAI(options: {
  readonly repo: AiOrchestrationRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly idempotencyKey: string | undefined;
}) {
  requireAiPermission(options.actorPermissions, "ai.disable");
  if (!options.idempotencyKey?.trim()) {
    throw new AiOrchestrationError("Idempotency-Key required.", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const now = new Date().toISOString();
  await options.repo.setTenantSwitch(options.tenantId, DEFAULT_SWITCH);
  return {
    data: toAiResource({
      id: options.tenantId,
      tenantId: options.tenantId,
      status: "enabled",
      createdAt: now
    }),
    meta: {}
  };
}

export async function getAIQualityReport(options: {
  readonly repo: AiOrchestrationRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
}) {
  requireAiPermission(options.actorPermissions, "report.ai_quality.read");
  const logs = await options.repo.listLogs(options.tenantId);
  const blocked = await options.repo.listBlockedOutputs(options.tenantId);
  const suggestions = await options.repo.listPromptVersions(options.tenantId);
  const budget = await options.repo.getTenantBudget(options.tenantId);
  const metrics = buildAiQualityDashboard({
    blockedCount: blocked.length,
    suggestionCount: Math.max(logs.length, 1),
    acceptedCount: logs.filter((l) => l.status === "completed").length,
    escalationCount: blocked.filter((b) => b.ruleId === "AI-R005").length,
    avgLatencyMs: logs.length
      ? logs.reduce((s, l) => s + l.latencyMs, 0) / logs.length
      : 0,
    tokensUsed: budget.tokensUsed,
    fallbackCount: 0
  });
  void suggestions;
  return { data: toAnalyticsReport(metrics), meta: {} };
}

/** BE-AI-007/008 — Read/mutation tool stubs invoked via policy gateway. */
export async function invokeAiToolStub(options: {
  readonly repo: AiOrchestrationRepository;
  readonly tenantId: string;
  readonly actorPermissions: readonly string[];
  readonly toolName: string;
  readonly input: Record<string, unknown>;
  readonly aiMode: "copilot" | "semi_auto" | "autopilot";
  readonly idempotencyKey?: string;
  readonly hasApproval?: boolean;
}) {
  const policy = evaluateToolPolicy({
    toolName: options.toolName,
    actorPermissions: options.actorPermissions,
    aiMode: options.aiMode,
    ...(options.hasApproval !== undefined ? { hasApproval: options.hasApproval } : {})
  });
  const now = new Date().toISOString();
  await options.repo.createToolCall({
    id: generateUuidV7(),
    tenantId: options.tenantId,
    suggestionId: null,
    toolName: options.toolName,
    riskClass: policy.tool.riskClass,
    status: policy.decision === "allow" ? "allowed" : "denied",
    idempotencyKey: options.idempotencyKey ?? null,
    createdAt: now
  });
  if (policy.decision === "deny") {
    throw new AiOrchestrationError(policy.reason, "AI_TOOL_NOT_ALLOWED");
  }
  if (policy.decision === "require_approval") {
    throw new AiOrchestrationError("Approval required.", "AI_APPROVAL_REQUIRED");
  }
  return invokeToolStub(options.toolName, options.input);
}

export { meetsReleaseThreshold, runEvalStub };
