/** BE-AI-002 — Prompt/model/tool/retrieval config version model (immutable version IDs). */

export type PromptVersionStatus = "draft" | "evaluating" | "approved" | "active" | "retired";

export interface AiConfigBundle {
  readonly promptVersionId: string;
  readonly modelProvider: string;
  readonly modelName: string;
  readonly modelVersion: string;
  readonly toolRegistryVersion: string;
  readonly retrievalConfigVersion: string;
  readonly policyRuleVersion: string;
  readonly outputSchemaVersion: string;
  readonly fallbackPolicyVersion: string;
}

export const DEFAULT_CONFIG_BUNDLE: AiConfigBundle = {
  promptVersionId: "prompt-v1-stub",
  modelProvider: "stub",
  modelName: "stub-gpt",
  modelVersion: "1.0.0",
  toolRegistryVersion: "tools-v1",
  retrievalConfigVersion: "retrieval-v1",
  policyRuleVersion: "policy-v1",
  outputSchemaVersion: "suggestion-v1",
  fallbackPolicyVersion: "fallback-v1"
};

export function buildConfigBundle(overrides: Partial<AiConfigBundle> = {}): AiConfigBundle {
  return { ...DEFAULT_CONFIG_BUNDLE, ...overrides };
}

export function canActivatePrompt(status: PromptVersionStatus): boolean {
  return status === "approved";
}

export function nextPromptStatus(
  current: PromptVersionStatus,
  action: "submit_eval" | "approve" | "activate" | "retire" | "rollback"
): PromptVersionStatus {
  switch (action) {
    case "submit_eval":
      return current === "draft" ? "evaluating" : current;
    case "approve":
      return current === "evaluating" ? "approved" : current;
    case "activate":
      return current === "approved" ? "active" : current;
    case "retire":
      return "retired";
    case "rollback":
      return "approved";
    default:
      return current;
  }
}
