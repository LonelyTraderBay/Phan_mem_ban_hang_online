/**
 * BE-CON-008 — Lead score v1 with rule version/provenance stub.
 */

export const LEAD_SCORE_RULE_VERSION = "lead-score-v1" as const;

export interface LeadScoreInput {
  readonly inboundMessageCount: number;
  readonly hasPurchaseIntentKeywords: boolean;
  readonly escalationStatus: "normal" | "escalated";
}

export interface LeadScoreResult {
  readonly score: number;
  readonly ruleVersion: typeof LEAD_SCORE_RULE_VERSION;
  readonly provenance: {
    readonly inbound_message_count: number;
    readonly has_purchase_intent: boolean;
    readonly escalation_boost: number;
  };
}

const INTENT_KEYWORDS = ["mua", "giá", "order", "đặt hàng", "bao nhiêu"];

export function detectPurchaseIntent(text: string | null): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return INTENT_KEYWORDS.some((kw) => lower.includes(kw));
}

export function computeLeadScoreV1(input: LeadScoreInput): LeadScoreResult {
  let score = Math.min(40, input.inboundMessageCount * 10);
  if (input.hasPurchaseIntentKeywords) score += 35;
  const escalationBoost = input.escalationStatus === "escalated" ? 15 : 0;
  score += escalationBoost;
  return {
    score: Math.min(100, score),
    ruleVersion: LEAD_SCORE_RULE_VERSION,
    provenance: {
      inbound_message_count: input.inboundMessageCount,
      has_purchase_intent: input.hasPurchaseIntentKeywords,
      escalation_boost: escalationBoost
    }
  };
}
