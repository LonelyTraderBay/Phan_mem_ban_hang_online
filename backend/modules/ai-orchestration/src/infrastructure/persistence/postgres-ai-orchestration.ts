import { sql } from "kysely";
import type { AppDatabase } from "@ai-sales/database";
import { adapterSecurityContext, withTenantTransaction } from "@ai-sales/database";
import { DEFAULT_BUDGET, DEFAULT_SWITCH } from "../../domain/budget-switches.js";
import type { TenantAiBudget, TenantAiSwitchState } from "../../domain/budget-switches.js";
import type {
  AiLogRecord,
  AiOrchestrationRepository,
  BlockedOutputRecord,
  EvalRunRecord,
  PromptVersionRecord,
  SuggestionRecord,
  ToolCallRecord
} from "./in-memory-ai-orchestration.js";

type Trx = Parameters<Parameters<typeof withTenantTransaction>[2]>[0];

type ControlsRow = {
  tenant_id: string;
  switch_enabled: boolean;
  switch_reason: string | null;
  budget_tokens_remaining: number | string;
  budget_period: string | null;
  updated_at: Date;
  metadata: unknown;
};

type SuggestionRow = {
  id: string;
  tenant_id: string;
  conversation_id: string;
  message_id: string | null;
  mode: SuggestionRecord["mode"];
  status: SuggestionRecord["status"];
  output_redacted: string | null;
  prompt_version_id: string | null;
  created_at: Date;
  updated_at: Date;
};

type LogRow = {
  id: string;
  tenant_id: string;
  conversation_id: string | null;
  suggestion_id: string | null;
  request_type: string;
  status: string;
  prompt_version_id: string | null;
  model_provider: string | null;
  tokens_used: number | string;
  latency_ms: number | string;
  correlation_id: string | null;
  created_at: Date;
};

type BlockedRow = {
  id: string;
  tenant_id: string;
  suggestion_id: string | null;
  rule_id: string;
  severity: string;
  evidence_hash: string;
  safe_fallback: string | null;
  created_at: Date;
};

type PromptRow = {
  id: string;
  tenant_id: string;
  name: string;
  content: string;
  risk_level: PromptVersionRecord["riskLevel"];
  status: PromptVersionRecord["status"];
  version: number | string;
  created_at: Date;
  updated_at: Date;
};

type EvalRow = {
  id: string;
  tenant_id: string | null;
  prompt_version_id: string | null;
  status: EvalRunRecord["status"];
  passed: boolean | null;
  critical_violations: number | string;
  total_cases: number | string;
  created_at: Date;
  updated_at: Date;
};

type ToolRow = {
  id: string;
  tenant_id: string;
  suggestion_id: string | null;
  tool_name: string;
  risk_class: ToolCallRecord["riskClass"];
  status: ToolCallRecord["status"];
  idempotency_key: string | null;
  created_at: Date;
};

type ControlsPayload = {
  switch?: TenantAiSwitchState | undefined;
  budget?: TenantAiBudget | undefined;
};

function parseControls(meta: unknown): ControlsPayload {
  const obj = parseObject(meta);
  const payload: ControlsPayload = {};
  if (obj.switch && typeof obj.switch === "object") {
    payload.switch = obj.switch as TenantAiSwitchState;
  }
  if (obj.budget && typeof obj.budget === "object") {
    payload.budget = obj.budget as TenantAiBudget;
  }
  return payload;
}

const SUGGESTION_SELECT = sql`
  id, tenant_id, conversation_id, message_id, mode, status, output_redacted,
  prompt_version_id, created_at, updated_at
`;

const LOG_SELECT = sql`
  id, tenant_id, conversation_id, suggestion_id, request_type, status,
  prompt_version_id, model_provider, tokens_used, latency_ms, correlation_id, created_at
`;

const BLOCKED_SELECT = sql`
  id, tenant_id, suggestion_id, rule_id, severity, evidence_hash, safe_fallback, created_at
`;

const PROMPT_SELECT = sql`
  id, tenant_id, name, content, risk_level, status, version, created_at, updated_at
`;

const EVAL_SELECT = sql`
  id, tenant_id, prompt_version_id, status, passed, critical_violations, total_cases,
  created_at, updated_at
`;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code: unknown }).code) === "23505"
  );
}

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

function toSuggestion(row: SuggestionRow): SuggestionRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    mode: row.mode,
    status: row.status,
    outputRedacted: row.output_redacted,
    promptVersionId: row.prompt_version_id,
    createdAt: toIso(row.created_at)!,
    updatedAt: toIso(row.updated_at)!
  };
}

function toLog(row: LogRow): AiLogRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    conversationId: row.conversation_id,
    suggestionId: row.suggestion_id,
    requestType: row.request_type,
    status: row.status,
    promptVersionId: row.prompt_version_id,
    modelProvider: row.model_provider,
    tokensUsed: Number(row.tokens_used),
    latencyMs: Number(row.latency_ms),
    correlationId: row.correlation_id,
    createdAt: toIso(row.created_at)!
  };
}

function toBlocked(row: BlockedRow): BlockedOutputRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    suggestionId: row.suggestion_id,
    ruleId: row.rule_id as BlockedOutputRecord["ruleId"],
    severity: row.severity,
    evidenceHash: row.evidence_hash,
    safeFallback: row.safe_fallback,
    createdAt: toIso(row.created_at)!
  };
}

function toPrompt(row: PromptRow): PromptVersionRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    content: row.content,
    riskLevel: row.risk_level,
    status: row.status,
    version: Number(row.version),
    createdAt: toIso(row.created_at)!,
    updatedAt: toIso(row.updated_at)!
  };
}

function toEval(row: EvalRow): EvalRunRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id ?? "",
    promptVersionId: row.prompt_version_id ?? "",
    status: row.status,
    passed: row.passed,
    criticalViolations: Number(row.critical_violations),
    totalCases: Number(row.total_cases),
    createdAt: toIso(row.created_at)!,
    updatedAt: toIso(row.updated_at)!
  };
}

function toTool(row: ToolRow): ToolCallRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    suggestionId: row.suggestion_id,
    toolName: row.tool_name,
    riskClass: row.risk_class,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    createdAt: toIso(row.created_at)!
  };
}

/** v1 process-local idempotency — migrate to app.idempotency_records when wired. */
export class PostgresAiOrchestrationRepository implements AiOrchestrationRepository {
  private readonly idempotency = new Map<string, string>();

  constructor(private readonly db: AppDatabase) {}

  private idemKey(tenantId: string, key: string): string {
    return `${tenantId}:${key}`;
  }

  private async loadControls(trx: Trx, tenantId: string): Promise<ControlsRow | null> {
    const result = await sql<ControlsRow>`
      select tenant_id, switch_enabled, switch_reason, budget_tokens_remaining,
             budget_period, updated_at, metadata
      from app.tenant_ai_controls
      where tenant_id = ${tenantId}::uuid
    `.execute(trx);
    return result.rows[0] ?? null;
  }

  private async upsertControls(
    trx: Trx,
    tenantId: string,
    patch: {
      readonly switchEnabled?: boolean;
      readonly switchReason?: string | null;
      readonly budgetTokensRemaining?: number;
      readonly budgetPeriod?: string | null;
      readonly metadata: ControlsPayload;
    }
  ): Promise<void> {
    const current = await this.loadControls(trx, tenantId);
    const currentMeta = current ? parseControls(current.metadata) : {};
    const metadata: ControlsPayload = {};
    if (patch.metadata.switch !== undefined) {
      metadata.switch = patch.metadata.switch;
    } else if (currentMeta.switch !== undefined) {
      metadata.switch = currentMeta.switch;
    }
    if (patch.metadata.budget !== undefined) {
      metadata.budget = patch.metadata.budget;
    } else if (currentMeta.budget !== undefined) {
      metadata.budget = currentMeta.budget;
    }
    const switchEnabled =
      patch.switchEnabled ?? current?.switch_enabled ?? !DEFAULT_SWITCH.disabled;
    const switchReason =
      patch.switchReason !== undefined
        ? patch.switchReason
        : (current?.switch_reason ?? null);
    const budgetTokensRemaining =
      patch.budgetTokensRemaining ??
      (current ? Number(current.budget_tokens_remaining) : DEFAULT_BUDGET.tokenBudget);
    const budgetPeriod =
      patch.budgetPeriod !== undefined
        ? patch.budgetPeriod
        : (current?.budget_period ?? "daily");

    await sql`
      insert into app.tenant_ai_controls (
        tenant_id, switch_enabled, switch_reason, budget_tokens_remaining,
        budget_period, updated_at, metadata
      ) values (
        ${tenantId}::uuid,
        ${switchEnabled},
        ${switchReason},
        ${budgetTokensRemaining},
        ${budgetPeriod},
        now(),
        ${JSON.stringify(metadata)}::jsonb
      )
      on conflict (tenant_id) do update set
        switch_enabled = excluded.switch_enabled,
        switch_reason = excluded.switch_reason,
        budget_tokens_remaining = excluded.budget_tokens_remaining,
        budget_period = excluded.budget_period,
        updated_at = now(),
        metadata = excluded.metadata
    `.execute(trx);
  }

  async getTenantSwitch(tenantId: string): Promise<TenantAiSwitchState> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const row = await this.loadControls(trx, tenantId);
      if (!row) return DEFAULT_SWITCH;
      const meta = parseControls(row.metadata);
      if (meta.switch) return meta.switch;
      return {
        disabled: !row.switch_enabled,
        disabledAt: row.switch_enabled ? null : toIso(row.updated_at),
        disabledBy: row.switch_reason,
        fallbackMode: "deterministic"
      };
    });
  }

  async setTenantSwitch(tenantId: string, state: TenantAiSwitchState): Promise<void> {
    const ctx = adapterSecurityContext(tenantId, state.disabledBy ?? undefined);
    await withTenantTransaction(this.db, ctx, async (trx) => {
      await this.upsertControls(trx, tenantId, {
        switchEnabled: !state.disabled,
        switchReason: state.disabledBy,
        metadata: { switch: state }
      });
    });
  }

  async getTenantBudget(tenantId: string): Promise<TenantAiBudget> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const row = await this.loadControls(trx, tenantId);
      if (!row) return DEFAULT_BUDGET;
      const meta = parseControls(row.metadata);
      if (meta.budget) return meta.budget;
      // Column-only fallback: never invent tokensUsed from DEFAULT - remaining.
      const remaining = Number(row.budget_tokens_remaining);
      return {
        ...DEFAULT_BUDGET,
        tokenBudget: DEFAULT_BUDGET.tokenBudget,
        tokensUsed: Math.max(0, DEFAULT_BUDGET.tokenBudget - remaining)
      };
    });
  }

  async updateTenantBudget(tenantId: string, budget: TenantAiBudget): Promise<void> {
    const ctx = adapterSecurityContext(tenantId);
    await withTenantTransaction(this.db, ctx, async (trx) => {
      const remaining = Math.max(0, budget.tokenBudget - budget.tokensUsed);
      await this.upsertControls(trx, tenantId, {
        budgetTokensRemaining: remaining,
        budgetPeriod: "daily",
        metadata: { budget }
      });
    });
  }

  /** Atomic budget increment (FOR UPDATE) — used by application duck-typed path. */
  async incrementTenantBudget(tenantId: string, tokens: number): Promise<void> {
    const ctx = adapterSecurityContext(tenantId);
    await withTenantTransaction(this.db, ctx, async (trx) => {
      await sql`
        select tenant_id from app.tenant_ai_controls
        where tenant_id = ${tenantId}::uuid
        for update
      `.execute(trx);
      const current = (await this.loadControls(trx, tenantId)) ?? null;
      const meta = current ? parseControls(current.metadata) : {};
      const budget: TenantAiBudget = meta.budget
        ? {
            ...meta.budget,
            usedToday: meta.budget.usedToday + 1,
            tokensUsed: meta.budget.tokensUsed + tokens,
            activeJobs: Math.max(0, meta.budget.activeJobs)
          }
        : {
            ...DEFAULT_BUDGET,
            usedToday: 1,
            tokensUsed: tokens
          };
      const remaining = Math.max(0, budget.tokenBudget - budget.tokensUsed);
      await this.upsertControls(trx, tenantId, {
        budgetTokensRemaining: remaining,
        budgetPeriod: "daily",
        metadata: { budget }
      });
    });
  }

  async createSuggestion(record: SuggestionRecord): Promise<SuggestionRecord> {
    const ctx = adapterSecurityContext(record.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<SuggestionRow>`
        insert into app.ai_suggestions (
          id, tenant_id, conversation_id, message_id, mode, status, output_redacted,
          prompt_version_id, version, created_at, updated_at, metadata
        ) values (
          ${record.id}::uuid,
          ${record.tenantId}::uuid,
          ${record.conversationId}::uuid,
          ${record.messageId}::uuid,
          ${record.mode},
          ${record.status},
          ${record.outputRedacted},
          ${record.promptVersionId}::uuid,
          1,
          ${record.createdAt}::timestamptz,
          ${record.updatedAt}::timestamptz,
          '{}'::jsonb
        )
        returning ${SUGGESTION_SELECT}
      `.execute(trx);
      return toSuggestion(result.rows[0]!);
    });
  }

  async getSuggestion(args: {
    readonly tenantId: string;
    readonly suggestionId: string;
  }): Promise<SuggestionRecord | null> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<SuggestionRow>`
        select ${SUGGESTION_SELECT}
        from app.ai_suggestions
        where id = ${args.suggestionId}::uuid and tenant_id = ${args.tenantId}::uuid
      `.execute(trx);
      const row = result.rows[0];
      return row ? toSuggestion(row) : null;
    });
  }

  async listSuggestionsByConversation(args: {
    readonly tenantId: string;
    readonly conversationId: string;
  }): Promise<readonly SuggestionRecord[]> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<SuggestionRow>`
        select ${SUGGESTION_SELECT}
        from app.ai_suggestions
        where tenant_id = ${args.tenantId}::uuid
          and conversation_id = ${args.conversationId}::uuid
        order by created_at asc, id asc
      `.execute(trx);
      return result.rows.map(toSuggestion);
    });
  }

  async updateSuggestion(record: SuggestionRecord): Promise<SuggestionRecord> {
    const ctx = adapterSecurityContext(record.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<SuggestionRow>`
        update app.ai_suggestions
        set conversation_id = ${record.conversationId}::uuid,
            message_id = ${record.messageId}::uuid,
            mode = ${record.mode},
            status = ${record.status},
            output_redacted = ${record.outputRedacted},
            prompt_version_id = ${record.promptVersionId}::uuid,
            version = version + 1,
            updated_at = ${record.updatedAt}::timestamptz
        where id = ${record.id}::uuid and tenant_id = ${record.tenantId}::uuid
        returning ${SUGGESTION_SELECT}
      `.execute(trx);
      if (!result.rows[0]) {
        // Insert if missing (mirrors in-memory put semantics for race-safe upserts).
        const inserted = await sql<SuggestionRow>`
          insert into app.ai_suggestions (
            id, tenant_id, conversation_id, message_id, mode, status, output_redacted,
            prompt_version_id, version, created_at, updated_at, metadata
          ) values (
            ${record.id}::uuid,
            ${record.tenantId}::uuid,
            ${record.conversationId}::uuid,
            ${record.messageId}::uuid,
            ${record.mode},
            ${record.status},
            ${record.outputRedacted},
            ${record.promptVersionId}::uuid,
            1,
            ${record.createdAt}::timestamptz,
            ${record.updatedAt}::timestamptz,
            '{}'::jsonb
          )
          returning ${SUGGESTION_SELECT}
        `.execute(trx);
        return toSuggestion(inserted.rows[0]!);
      }
      return toSuggestion(result.rows[0]);
    });
  }

  async createLog(record: AiLogRecord): Promise<AiLogRecord> {
    const ctx = adapterSecurityContext(record.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<LogRow>`
        insert into app.ai_logs (
          id, tenant_id, conversation_id, suggestion_id, request_type, status,
          prompt_version_id, model_provider, model_name, tokens_used, latency_ms,
          correlation_id, created_at, metadata
        ) values (
          ${record.id}::uuid,
          ${record.tenantId}::uuid,
          ${record.conversationId}::uuid,
          ${record.suggestionId}::uuid,
          ${record.requestType},
          ${record.status},
          ${record.promptVersionId}::uuid,
          ${record.modelProvider},
          null,
          ${record.tokensUsed},
          ${record.latencyMs},
          ${record.correlationId},
          ${record.createdAt}::timestamptz,
          '{}'::jsonb
        )
        returning ${LOG_SELECT}
      `.execute(trx);
      return toLog(result.rows[0]!);
    });
  }

  async getLog(args: {
    readonly tenantId: string;
    readonly logId: string;
  }): Promise<AiLogRecord | null> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<LogRow>`
        select ${LOG_SELECT}
        from app.ai_logs
        where id = ${args.logId}::uuid and tenant_id = ${args.tenantId}::uuid
      `.execute(trx);
      const row = result.rows[0];
      return row ? toLog(row) : null;
    });
  }

  async listLogs(tenantId: string): Promise<readonly AiLogRecord[]> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<LogRow>`
        select ${LOG_SELECT}
        from app.ai_logs
        where tenant_id = ${tenantId}::uuid
        order by created_at desc, id desc
      `.execute(trx);
      return result.rows.map(toLog);
    });
  }

  async createBlockedOutput(record: BlockedOutputRecord): Promise<BlockedOutputRecord> {
    const ctx = adapterSecurityContext(record.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<BlockedRow>`
        insert into app.ai_blocked_outputs (
          id, tenant_id, suggestion_id, rule_id, severity, evidence_hash,
          safe_fallback, created_at, metadata
        ) values (
          ${record.id}::uuid,
          ${record.tenantId}::uuid,
          ${record.suggestionId}::uuid,
          ${record.ruleId},
          ${record.severity},
          ${record.evidenceHash},
          ${record.safeFallback},
          ${record.createdAt}::timestamptz,
          '{}'::jsonb
        )
        returning ${BLOCKED_SELECT}
      `.execute(trx);
      return toBlocked(result.rows[0]!);
    });
  }

  async listBlockedOutputs(tenantId: string): Promise<readonly BlockedOutputRecord[]> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<BlockedRow>`
        select ${BLOCKED_SELECT}
        from app.ai_blocked_outputs
        where tenant_id = ${tenantId}::uuid
        order by created_at desc, id desc
      `.execute(trx);
      return result.rows.map(toBlocked);
    });
  }

  async createPromptVersion(record: PromptVersionRecord): Promise<PromptVersionRecord> {
    const ctx = adapterSecurityContext(record.tenantId);
    const attempt = async (): Promise<PromptVersionRecord> =>
      withTenantTransaction(this.db, ctx, async (trx) => {
        if (record.status === "active") {
          await sql`
            update app.prompt_versions
            set status = 'retired',
                version = version + 1,
                updated_at = now()
            where tenant_id = ${record.tenantId}::uuid
              and status = 'active'
              and id <> ${record.id}::uuid
          `.execute(trx);
        }
        const result = await sql<PromptRow>`
          insert into app.prompt_versions (
            id, tenant_id, name, content, risk_level, status, version,
            created_at, updated_at, metadata
          ) values (
            ${record.id}::uuid,
            ${record.tenantId}::uuid,
            ${record.name},
            ${record.content},
            ${record.riskLevel},
            ${record.status},
            ${record.version},
            ${record.createdAt}::timestamptz,
            ${record.updatedAt}::timestamptz,
            '{}'::jsonb
          )
          returning ${PROMPT_SELECT}
        `.execute(trx);
        return toPrompt(result.rows[0]!);
      });
    try {
      return await attempt();
    } catch (error) {
      if (!isUniqueViolation(error) || record.status !== "active") throw error;
      // Concurrent activate race on uq_prompt_versions_tenant_active — retry once.
      return attempt();
    }
  }

  async getPromptVersion(args: {
    readonly tenantId: string;
    readonly promptVersionId: string;
  }): Promise<PromptVersionRecord | null> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<PromptRow>`
        select ${PROMPT_SELECT}
        from app.prompt_versions
        where id = ${args.promptVersionId}::uuid and tenant_id = ${args.tenantId}::uuid
      `.execute(trx);
      const row = result.rows[0];
      return row ? toPrompt(row) : null;
    });
  }

  async listPromptVersions(tenantId: string): Promise<readonly PromptVersionRecord[]> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<PromptRow>`
        select ${PROMPT_SELECT}
        from app.prompt_versions
        where tenant_id = ${tenantId}::uuid
        order by created_at asc, id asc
      `.execute(trx);
      return result.rows.map(toPrompt);
    });
  }

  async updatePromptVersion(record: PromptVersionRecord): Promise<PromptVersionRecord> {
    const ctx = adapterSecurityContext(record.tenantId);
    const attempt = async (): Promise<PromptVersionRecord> =>
      withTenantTransaction(this.db, ctx, async (trx) => {
        if (record.status === "active") {
          await sql`
            update app.prompt_versions
            set status = 'retired',
                version = version + 1,
                updated_at = now()
            where tenant_id = ${record.tenantId}::uuid
              and status = 'active'
              and id <> ${record.id}::uuid
          `.execute(trx);
        }
        const result = await sql<PromptRow>`
          update app.prompt_versions
          set name = ${record.name},
              content = ${record.content},
              risk_level = ${record.riskLevel},
              status = ${record.status},
              version = ${record.version},
              updated_at = ${record.updatedAt}::timestamptz
          where id = ${record.id}::uuid and tenant_id = ${record.tenantId}::uuid
          returning ${PROMPT_SELECT}
        `.execute(trx);
        if (!result.rows[0]) {
          throw new Error("Prompt version not found.");
        }
        return toPrompt(result.rows[0]);
      });
    try {
      return await attempt();
    } catch (error) {
      if (!isUniqueViolation(error) || record.status !== "active") throw error;
      return attempt();
    }
  }

  async getActivePromptVersion(tenantId: string): Promise<PromptVersionRecord | null> {
    const ctx = adapterSecurityContext(tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<PromptRow>`
        select ${PROMPT_SELECT}
        from app.prompt_versions
        where tenant_id = ${tenantId}::uuid and status = 'active'
        limit 1
      `.execute(trx);
      const row = result.rows[0];
      return row ? toPrompt(row) : null;
    });
  }

  async createEvalRun(record: EvalRunRecord): Promise<EvalRunRecord> {
    const ctx = adapterSecurityContext(record.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<EvalRow>`
        insert into app.ai_evaluation_runs (
          id, tenant_id, set_id, prompt_version_id, status, passed,
          critical_violations, total_cases, created_at, updated_at, metadata
        ) values (
          ${record.id}::uuid,
          ${record.tenantId}::uuid,
          null,
          ${record.promptVersionId}::uuid,
          ${record.status},
          ${record.passed},
          ${record.criticalViolations},
          ${record.totalCases},
          ${record.createdAt}::timestamptz,
          ${record.updatedAt}::timestamptz,
          ${JSON.stringify({ tenant_id: record.tenantId })}::jsonb
        )
        returning ${EVAL_SELECT}
      `.execute(trx);
      return toEval(result.rows[0]!);
    });
  }

  async getEvalRun(args: {
    readonly tenantId: string;
    readonly runId: string;
  }): Promise<EvalRunRecord | null> {
    const ctx = adapterSecurityContext(args.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<EvalRow>`
        select ${EVAL_SELECT}
        from app.ai_evaluation_runs
        where id = ${args.runId}::uuid
          and tenant_id = ${args.tenantId}::uuid
      `.execute(trx);
      const row = result.rows[0];
      return row ? toEval(row) : null;
    });
  }

  async createToolCall(record: ToolCallRecord): Promise<ToolCallRecord> {
    const ctx = adapterSecurityContext(record.tenantId);
    return withTenantTransaction(this.db, ctx, async (trx) => {
      const result = await sql<ToolRow>`
        insert into app.ai_tool_calls (
          id, tenant_id, suggestion_id, tool_name, risk_class, status,
          idempotency_key, created_at, metadata
        ) values (
          ${record.id}::uuid,
          ${record.tenantId}::uuid,
          ${record.suggestionId}::uuid,
          ${record.toolName},
          ${record.riskClass},
          ${record.status},
          ${record.idempotencyKey},
          ${record.createdAt}::timestamptz,
          '{}'::jsonb
        )
        returning id, tenant_id, suggestion_id, tool_name, risk_class, status,
                  idempotency_key, created_at
      `.execute(trx);
      return toTool(result.rows[0]!);
    });
  }

  async getIdempotentJob(
    tenantId: string,
    key: string
  ): Promise<{ readonly jobId: string } | null> {
    const jobId = this.idempotency.get(this.idemKey(tenantId, key));
    return jobId ? { jobId } : null;
  }

  async rememberIdempotentJob(tenantId: string, key: string, jobId: string): Promise<void> {
    this.idempotency.set(this.idemKey(tenantId, key), jobId);
  }
}
