/** BE-AI-001 — Model gateway stub with health/timeouts. */

export interface ModelGatewayConfig {
  readonly provider: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
}

export const DEFAULT_GATEWAY_CONFIG: ModelGatewayConfig = {
  provider: "stub",
  model: "stub-gpt",
  timeoutMs: 30_000,
  maxRetries: 1
};

export interface ModelCompletionRequest {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly maxTokens?: number;
}

export interface ModelCompletionResult {
  readonly text: string;
  readonly tokensUsed: number;
  readonly latencyMs: number;
  readonly provider: string;
  readonly model: string;
}

export interface ModelGatewayPort {
  complete(request: ModelCompletionRequest): Promise<ModelCompletionResult>;
  healthCheck(): Promise<{ readonly ok: boolean; readonly provider: string }>;
}

export class StubModelGateway implements ModelGatewayPort {
  constructor(private readonly config: ModelGatewayConfig = DEFAULT_GATEWAY_CONFIG) {}

  async healthCheck(): Promise<{ readonly ok: boolean; readonly provider: string }> {
    return { ok: true, provider: this.config.provider };
  }

  async complete(request: ModelCompletionRequest): Promise<ModelCompletionResult> {
    const start = Date.now();
    const suggestion = {
      replyText: `Stub reply for: ${request.userPrompt.slice(0, 120)}`,
      claims: [],
      toolCalls: [],
      confidence: 0.8,
      schemaVersion: "suggestion-v1"
    };
    return {
      text: JSON.stringify(suggestion),
      tokensUsed: Math.min(request.maxTokens ?? 256, 256),
      latencyMs: Date.now() - start,
      provider: this.config.provider,
      model: this.config.model
    };
  }
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("AI_PROVIDER_UNAVAILABLE")), timeoutMs);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}
