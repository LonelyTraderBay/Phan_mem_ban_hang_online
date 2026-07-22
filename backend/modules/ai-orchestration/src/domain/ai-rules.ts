/** BE-AI-011 — AI-R001…AI-R010 enforcement stubs. */

import type { ClassifierResult } from "./classifier.js";
import type { QcValidationResult } from "./qc-validators.js";
import type { StructuredSuggestion } from "./suggestion-schema.js";

export type AiRuleId =
  | "AI-R001"
  | "AI-R002"
  | "AI-R003"
  | "AI-R004"
  | "AI-R005"
  | "AI-R006"
  | "AI-R007"
  | "AI-R008"
  | "AI-R009"
  | "AI-R010";

export interface RuleViolation {
  readonly ruleId: AiRuleId;
  readonly severity: "critical" | "high" | "medium";
  readonly message: string;
}

export interface RuleEnforcementResult {
  readonly blocked: boolean;
  readonly violations: readonly RuleViolation[];
  readonly safeFallback: string | null;
}

export function enforceAiRules(options: {
  readonly tenantId: string;
  readonly requestTenantId: string;
  readonly suggestion: StructuredSuggestion | null;
  readonly classifier: ClassifierResult;
  readonly qc: QcValidationResult;
  readonly toolCount: number;
  readonly tokenBudgetRemaining: number;
}): RuleEnforcementResult {
  const violations: RuleViolation[] = [];

  if (options.tenantId !== options.requestTenantId) {
    violations.push({
      ruleId: "AI-R001",
      severity: "critical",
      message: "Cross-tenant context mismatch."
    });
  }

  for (const v of options.qc.violations) {
    if (v.includes("AI-R002") || v.includes("tool evidence")) {
      violations.push({ ruleId: "AI-R002", severity: "critical", message: v });
    }
    if (v.includes("AI-R004") || v.includes("PII")) {
      violations.push({ ruleId: "AI-R004", severity: "critical", message: v });
    }
    if (v.includes("AI-R008") || v.includes("AI-R009") || v.includes("AI_SOURCE")) {
      violations.push({
        ruleId: v.includes("AI-R009") ? "AI-R009" : "AI-R008",
        severity: "high",
        message: v
      });
    }
  }

  if (options.classifier.requiresEscalation) {
    violations.push({
      ruleId: "AI-R005",
      severity: "high",
      message: "High-risk intent requires escalation."
    });
  }

  if (!options.suggestion) {
    violations.push({
      ruleId: "AI-R010",
      severity: "medium",
      message: "Structured output invalid after repair."
    });
  }

  if (options.toolCount > 20) {
    violations.push({
      ruleId: "AI-R010",
      severity: "high",
      message: "Tool call budget exceeded."
    });
  }

  if (options.tokenBudgetRemaining <= 0) {
    violations.push({
      ruleId: "AI-R010",
      severity: "high",
      message: "Token budget exceeded."
    });
  }

  const blocked = violations.some((v) => v.severity === "critical" || v.severity === "high");
  return {
    blocked,
    violations,
    safeFallback: blocked
      ? "Xin lỗi, tôi cần chuyển bạn cho nhân viên hỗ trợ để xử lý yêu cầu này."
      : null
  };
}

export function mapViolationToErrorCode(violations: readonly RuleViolation[]): string {
  if (violations.some((v) => v.ruleId === "AI-R005")) return "AI_APPROVAL_REQUIRED";
  if (violations.some((v) => v.ruleId === "AI-R008")) return "AI_SOURCE_REQUIRED";
  if (violations.some((v) => v.message.includes("AI_SOURCE_STALE"))) return "AI_SOURCE_STALE";
  return "AI_OUTPUT_BLOCKED";
}
