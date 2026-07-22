/** BE-AI-015 — Budget/rate/concurrency/fallback/kill switches. */

export interface TenantAiBudget {
  readonly dailySuggestionLimit: number;
  readonly usedToday: number;
  readonly tokenBudget: number;
  readonly tokensUsed: number;
  readonly concurrencyLimit: number;
  readonly activeJobs: number;
}

export interface TenantAiSwitchState {
  readonly disabled: boolean;
  readonly disabledAt: string | null;
  readonly disabledBy: string | null;
  readonly fallbackMode: "deterministic" | "provider" | "none";
}

export const DEFAULT_BUDGET: TenantAiBudget = {
  dailySuggestionLimit: 500,
  usedToday: 0,
  tokenBudget: 100_000,
  tokensUsed: 0,
  concurrencyLimit: 5,
  activeJobs: 0
};

export const DEFAULT_SWITCH: TenantAiSwitchState = {
  disabled: false,
  disabledAt: null,
  disabledBy: null,
  fallbackMode: "deterministic"
};

export function checkBudget(budget: TenantAiBudget): { readonly ok: boolean; readonly code?: string } {
  if (budget.usedToday >= budget.dailySuggestionLimit) {
    return { ok: false, code: "AI_BUDGET_EXCEEDED" };
  }
  if (budget.tokensUsed >= budget.tokenBudget) {
    return { ok: false, code: "AI_BUDGET_EXCEEDED" };
  }
  if (budget.activeJobs >= budget.concurrencyLimit) {
    return { ok: false, code: "AI_PROVIDER_UNAVAILABLE" };
  }
  return { ok: true };
}

export function assertAiEnabled(state: TenantAiSwitchState): { readonly ok: boolean; readonly code?: string } {
  if (state.disabled) return { ok: false, code: "AI_DISABLED" };
  return { ok: true };
}
