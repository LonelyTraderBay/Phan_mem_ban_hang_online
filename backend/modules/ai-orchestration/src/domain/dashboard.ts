/** BE-AI-016 — Online quality/cost/safety dashboard stub. */

export interface AiQualityMetrics {
  readonly block_rate: number;
  readonly acceptance_rate: number;
  readonly escalation_rate: number;
  readonly avg_latency_ms: number;
  readonly cost_tokens: number;
  readonly fallback_rate: number;
}

export function buildAiQualityDashboard(options: {
  readonly blockedCount: number;
  readonly suggestionCount: number;
  readonly acceptedCount: number;
  readonly escalationCount: number;
  readonly avgLatencyMs: number;
  readonly tokensUsed: number;
  readonly fallbackCount: number;
}): AiQualityMetrics {
  const total = Math.max(options.suggestionCount, 1);
  return {
    block_rate: options.blockedCount / total,
    acceptance_rate: options.acceptedCount / total,
    escalation_rate: options.escalationCount / total,
    avg_latency_ms: options.avgLatencyMs,
    cost_tokens: options.tokensUsed,
    fallback_rate: options.fallbackCount / total
  };
}

export function toAnalyticsReport(metrics: AiQualityMetrics): {
  readonly generated_at: string;
  readonly metrics: Record<string, number>;
} {
  return {
    generated_at: new Date().toISOString(),
    metrics: {
      block_rate: metrics.block_rate,
      acceptance_rate: metrics.acceptance_rate,
      escalation_rate: metrics.escalation_rate,
      avg_latency_ms: metrics.avg_latency_ms,
      cost_tokens: metrics.cost_tokens,
      fallback_rate: metrics.fallback_rate
    }
  };
}
