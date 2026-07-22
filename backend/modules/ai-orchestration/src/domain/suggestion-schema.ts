/** BE-AI-009 — Structured suggestion schema + bounded repair. */

export type SuggestionMode = "copilot" | "semi_auto" | "autopilot";

export interface SuggestionClaim {
  readonly type: "price" | "stock" | "policy" | "general";
  readonly text: string;
  readonly sourceIds: readonly string[];
  readonly toolEvidence?: readonly string[];
}

export interface StructuredSuggestion {
  readonly replyText: string;
  readonly claims: readonly SuggestionClaim[];
  readonly toolCalls: readonly string[];
  readonly confidence: number;
  readonly schemaVersion: string;
}

const SCHEMA_VERSION = "suggestion-v1";
const MAX_REPAIR_ATTEMPTS = 2;

export function parseSuggestionJson(raw: string): StructuredSuggestion | null {
  try {
    const parsed = JSON.parse(raw) as Partial<StructuredSuggestion>;
    if (typeof parsed.replyText !== "string" || !parsed.replyText.trim()) return null;
    return {
      replyText: parsed.replyText.trim(),
      claims: Array.isArray(parsed.claims) ? parsed.claims : [],
      toolCalls: Array.isArray(parsed.toolCalls) ? parsed.toolCalls.map(String) : [],
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      schemaVersion: parsed.schemaVersion ?? SCHEMA_VERSION
    };
  } catch {
    return null;
  }
}

export function repairSuggestionOutput(raw: string): StructuredSuggestion | null {
  let attempt = 0;
  let candidate = raw.trim();

  while (attempt <= MAX_REPAIR_ATTEMPTS) {
    const parsed = parseSuggestionJson(candidate);
    if (parsed) return parsed;

    const jsonMatch = candidate.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      candidate = jsonMatch[0]!;
      attempt += 1;
      continue;
    }

    if (attempt === 0 && candidate.length > 0) {
      return {
        replyText: candidate.slice(0, 4000),
        claims: [],
        toolCalls: [],
        confidence: 0.3,
        schemaVersion: SCHEMA_VERSION
      };
    }
    break;
  }
  return null;
}

export function toSuggestionJson(suggestion: StructuredSuggestion): string {
  return JSON.stringify({ ...suggestion, schemaVersion: SCHEMA_VERSION });
}
