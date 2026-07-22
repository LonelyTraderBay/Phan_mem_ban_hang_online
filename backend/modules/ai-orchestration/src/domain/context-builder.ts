/** BE-AI-003 — Context builder, minimization, untrusted-content separation. */

export type ContextZone = "system" | "developer" | "trusted" | "untrusted";

export interface ContextSegment {
  readonly zone: ContextZone;
  readonly label: string;
  readonly content: string;
  readonly tokenEstimate: number;
}

export interface BuiltContext {
  readonly segments: readonly ContextSegment[];
  readonly totalTokens: number;
  readonly truncated: boolean;
}

const ZONE_ORDER: readonly ContextZone[] = ["system", "developer", "trusted", "untrusted"];

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function buildAiContext(options: {
  readonly systemPrompt: string;
  readonly developerPrompt?: string;
  readonly trustedFacts?: readonly string[];
  readonly untrustedMessages?: readonly string[];
  readonly maxTokens?: number;
}): BuiltContext {
  const maxTokens = options.maxTokens ?? 4096;
  const segments: ContextSegment[] = [];

  const push = (zone: ContextZone, label: string, content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;
    segments.push({ zone, label, content: trimmed, tokenEstimate: estimateTokens(trimmed) });
  };

  push("system", "policy", options.systemPrompt);
  if (options.developerPrompt) push("developer", "instructions", options.developerPrompt);
  for (const [i, fact] of (options.trustedFacts ?? []).entries()) {
    push("trusted", `fact-${i + 1}`, fact);
  }
  for (const [i, msg] of (options.untrustedMessages ?? []).entries()) {
    push("untrusted", `message-${i + 1}`, `[UNTRUSTED]\n${msg}`);
  }

  const ordered = [...segments].sort(
    (a, b) => ZONE_ORDER.indexOf(a.zone) - ZONE_ORDER.indexOf(b.zone)
  );

  let total = 0;
  let truncated = false;
  const kept: ContextSegment[] = [];
  for (const seg of ordered) {
    if (total + seg.tokenEstimate > maxTokens) {
      truncated = true;
      break;
    }
    kept.push(seg);
    total += seg.tokenEstimate;
  }

  return { segments: kept, totalTokens: total, truncated };
}

export function stripUntrustedFromOutput(text: string): string {
  return text.replace(/\[UNTRUSTED\]/g, "").trim();
}
