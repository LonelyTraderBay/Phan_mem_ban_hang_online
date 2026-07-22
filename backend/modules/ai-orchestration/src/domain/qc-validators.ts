/** BE-AI-010 — QC/claim/source/freshness validators. */

import type { SuggestionClaim } from "./suggestion-schema.js";

export interface QcValidationResult {
  readonly passed: boolean;
  readonly violations: readonly string[];
}

export interface FreshnessEvidence {
  readonly sourceId: string;
  readonly fetchedAt: string;
  readonly maxAgeSeconds: number;
}

const DEFAULT_FRESHNESS: Record<string, number> = {
  stock: 30,
  price: 300,
  policy: 86_400,
  customer: 300,
  order: 0
};

export function validateClaims(
  claims: readonly SuggestionClaim[],
  evidence: readonly FreshnessEvidence[]
): QcValidationResult {
  const violations: string[] = [];
  const now = Date.now();
  const evidenceBySource = new Map(evidence.map((e) => [e.sourceId, e]));

  for (const claim of claims) {
    if ((claim.type === "price" || claim.type === "stock") && claim.toolEvidence?.length === 0) {
      violations.push(`AI-R002: ${claim.type} claim without tool evidence.`);
    }
    if (claim.type === "policy" && claim.sourceIds.length === 0) {
      violations.push("AI-R008: policy claim without published source.");
    }
    for (const sourceId of claim.sourceIds) {
      const ev = evidenceBySource.get(sourceId);
      if (!ev) {
        violations.push(`AI-R008: missing source evidence for ${sourceId}.`);
        continue;
      }
      const ageMs = now - new Date(ev.fetchedAt).getTime();
      const maxAge = (DEFAULT_FRESHNESS[claim.type] ?? 300) * 1000;
      if (ageMs > maxAge) {
        violations.push(`AI_SOURCE_STALE: source ${sourceId} exceeded freshness window.`);
      }
    }
  }

  return { passed: violations.length === 0, violations };
}

export function validateOutputText(text: string): QcValidationResult {
  const violations: string[] = [];
  if (/\b(api[_-]?key|password|secret|bearer)\b/i.test(text)) {
    violations.push("AI-R009: potential secret disclosure.");
  }
  if (/\b\d{10,}\b/.test(text) && /\b(phone|sđt|điện thoại)\b/i.test(text)) {
    violations.push("AI-R004: potential PII disclosure.");
  }
  return { passed: violations.length === 0, violations };
}
