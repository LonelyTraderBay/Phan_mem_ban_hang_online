import type { PromptVersionStatus } from "../../domain/config-version.js";
import { DEFAULT_BUDGET, DEFAULT_SWITCH } from "../../domain/budget-switches.js";
import type { TenantAiBudget, TenantAiSwitchState } from "../../domain/budget-switches.js";
import type { AiRuleId } from "../../domain/ai-rules.js";
import type { ToolRiskClass } from "../../domain/tool-registry.js";

export type SuggestionStatus =
  | "queued"
  | "generating"
  | "pending_review"
  | "approved"
  | "sent"
  | "blocked"
  | "failed";

export interface SuggestionRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly conversationId: string;
  readonly messageId: string | null;
  readonly mode: "copilot" | "semi_auto" | "autopilot";
  readonly status: SuggestionStatus;
  readonly outputRedacted: string | null;
  readonly promptVersionId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AiLogRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly conversationId: string | null;
  readonly suggestionId: string | null;
  readonly requestType: string;
  readonly status: string;
  readonly promptVersionId: string | null;
  readonly modelProvider: string | null;
  readonly tokensUsed: number;
  readonly latencyMs: number;
  readonly correlationId: string | null;
  readonly createdAt: string;
}

export interface BlockedOutputRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly suggestionId: string | null;
  readonly ruleId: AiRuleId;
  readonly severity: string;
  readonly evidenceHash: string;
  readonly safeFallback: string | null;
  readonly createdAt: string;
}

export interface PromptVersionRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly content: string;
  readonly riskLevel: "low" | "medium" | "high";
  readonly status: PromptVersionStatus;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface EvalRunRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly promptVersionId: string;
  readonly status: "queued" | "running" | "completed" | "failed";
  readonly passed: boolean | null;
  readonly criticalViolations: number;
  readonly totalCases: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ToolCallRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly suggestionId: string | null;
  readonly toolName: string;
  readonly riskClass: ToolRiskClass;
  readonly status: "allowed" | "denied" | "failed";
  readonly idempotencyKey: string | null;
  readonly createdAt: string;
}

export interface AiOrchestrationRepository {
  getTenantSwitch(tenantId: string): Promise<TenantAiSwitchState>;
  setTenantSwitch(tenantId: string, state: TenantAiSwitchState): Promise<void>;
  getTenantBudget(tenantId: string): Promise<TenantAiBudget>;
  updateTenantBudget(tenantId: string, budget: TenantAiBudget): Promise<void>;

  createSuggestion(record: SuggestionRecord): Promise<SuggestionRecord>;
  getSuggestion(args: { readonly tenantId: string; readonly suggestionId: string }): Promise<SuggestionRecord | null>;
  listSuggestionsByConversation(args: {
    readonly tenantId: string;
    readonly conversationId: string;
  }): Promise<readonly SuggestionRecord[]>;
  updateSuggestion(record: SuggestionRecord): Promise<SuggestionRecord>;

  createLog(record: AiLogRecord): Promise<AiLogRecord>;
  getLog(args: { readonly tenantId: string; readonly logId: string }): Promise<AiLogRecord | null>;
  listLogs(tenantId: string): Promise<readonly AiLogRecord[]>;

  createBlockedOutput(record: BlockedOutputRecord): Promise<BlockedOutputRecord>;
  listBlockedOutputs(tenantId: string): Promise<readonly BlockedOutputRecord[]>;

  createPromptVersion(record: PromptVersionRecord): Promise<PromptVersionRecord>;
  getPromptVersion(args: {
    readonly tenantId: string;
    readonly promptVersionId: string;
  }): Promise<PromptVersionRecord | null>;
  listPromptVersions(tenantId: string): Promise<readonly PromptVersionRecord[]>;
  updatePromptVersion(record: PromptVersionRecord): Promise<PromptVersionRecord>;
  getActivePromptVersion(tenantId: string): Promise<PromptVersionRecord | null>;

  createEvalRun(record: EvalRunRecord): Promise<EvalRunRecord>;
  getEvalRun(args: { readonly tenantId: string; readonly runId: string }): Promise<EvalRunRecord | null>;

  createToolCall(record: ToolCallRecord): Promise<ToolCallRecord>;

  getIdempotentJob(tenantId: string, key: string): Promise<{ readonly jobId: string } | null>;
  rememberIdempotentJob(tenantId: string, key: string, jobId: string): Promise<void>;
}

export class InMemoryAiOrchestrationRepository implements AiOrchestrationRepository {
  private readonly switches = new Map<string, TenantAiSwitchState>();
  private readonly budgets = new Map<string, TenantAiBudget>();
  private readonly suggestions = new Map<string, SuggestionRecord>();
  private readonly logs = new Map<string, AiLogRecord>();
  private readonly blocked = new Map<string, BlockedOutputRecord>();
  private readonly prompts = new Map<string, PromptVersionRecord>();
  private readonly evalRuns = new Map<string, EvalRunRecord>();
  private readonly toolCalls = new Map<string, ToolCallRecord>();
  private readonly idempotency = new Map<string, string>();

  async getTenantSwitch(tenantId: string): Promise<TenantAiSwitchState> {
    return this.switches.get(tenantId) ?? DEFAULT_SWITCH;
  }

  async setTenantSwitch(tenantId: string, state: TenantAiSwitchState): Promise<void> {
    this.switches.set(tenantId, state);
  }

  async getTenantBudget(tenantId: string): Promise<TenantAiBudget> {
    return this.budgets.get(tenantId) ?? DEFAULT_BUDGET;
  }

  async updateTenantBudget(tenantId: string, budget: TenantAiBudget): Promise<void> {
    this.budgets.set(tenantId, budget);
  }

  async createSuggestion(record: SuggestionRecord): Promise<SuggestionRecord> {
    this.suggestions.set(record.id, record);
    return record;
  }

  async getSuggestion(args: {
    readonly tenantId: string;
    readonly suggestionId: string;
  }): Promise<SuggestionRecord | null> {
    const row = this.suggestions.get(args.suggestionId);
    return row?.tenantId === args.tenantId ? row : null;
  }

  async listSuggestionsByConversation(args: {
    readonly tenantId: string;
    readonly conversationId: string;
  }): Promise<readonly SuggestionRecord[]> {
    return [...this.suggestions.values()].filter(
      (s) => s.tenantId === args.tenantId && s.conversationId === args.conversationId
    );
  }

  async updateSuggestion(record: SuggestionRecord): Promise<SuggestionRecord> {
    this.suggestions.set(record.id, record);
    return record;
  }

  async createLog(record: AiLogRecord): Promise<AiLogRecord> {
    this.logs.set(record.id, record);
    return record;
  }

  async getLog(args: {
    readonly tenantId: string;
    readonly logId: string;
  }): Promise<AiLogRecord | null> {
    const row = this.logs.get(args.logId);
    return row?.tenantId === args.tenantId ? row : null;
  }

  async listLogs(tenantId: string): Promise<readonly AiLogRecord[]> {
    return [...this.logs.values()].filter((l) => l.tenantId === tenantId);
  }

  async createBlockedOutput(record: BlockedOutputRecord): Promise<BlockedOutputRecord> {
    this.blocked.set(record.id, record);
    return record;
  }

  async listBlockedOutputs(tenantId: string): Promise<readonly BlockedOutputRecord[]> {
    return [...this.blocked.values()].filter((b) => b.tenantId === tenantId);
  }

  async createPromptVersion(record: PromptVersionRecord): Promise<PromptVersionRecord> {
    this.prompts.set(record.id, record);
    return record;
  }

  async getPromptVersion(args: {
    readonly tenantId: string;
    readonly promptVersionId: string;
  }): Promise<PromptVersionRecord | null> {
    const row = this.prompts.get(args.promptVersionId);
    return row?.tenantId === args.tenantId ? row : null;
  }

  async listPromptVersions(tenantId: string): Promise<readonly PromptVersionRecord[]> {
    return [...this.prompts.values()].filter((p) => p.tenantId === tenantId);
  }

  async updatePromptVersion(record: PromptVersionRecord): Promise<PromptVersionRecord> {
    this.prompts.set(record.id, record);
    return record;
  }

  async getActivePromptVersion(tenantId: string): Promise<PromptVersionRecord | null> {
    return [...this.prompts.values()].find((p) => p.tenantId === tenantId && p.status === "active") ?? null;
  }

  async createEvalRun(record: EvalRunRecord): Promise<EvalRunRecord> {
    this.evalRuns.set(record.id, record);
    return record;
  }

  async getEvalRun(args: {
    readonly tenantId: string;
    readonly runId: string;
  }): Promise<EvalRunRecord | null> {
    const row = this.evalRuns.get(args.runId);
    return row?.tenantId === args.tenantId ? row : null;
  }

  async createToolCall(record: ToolCallRecord): Promise<ToolCallRecord> {
    this.toolCalls.set(record.id, record);
    return record;
  }

  async getIdempotentJob(tenantId: string, key: string): Promise<{ readonly jobId: string } | null> {
    const jobId = this.idempotency.get(`${tenantId}:${key}`);
    return jobId ? { jobId } : null;
  }

  async rememberIdempotentJob(tenantId: string, key: string, jobId: string): Promise<void> {
    this.idempotency.set(`${tenantId}:${key}`, jobId);
  }
}
