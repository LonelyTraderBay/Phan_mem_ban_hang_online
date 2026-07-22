/** BE-AI-004 — Intent/risk classifier interface with deterministic fallback. */

export type IntentLabel =
  | "greeting"
  | "product_inquiry"
  | "order_status"
  | "complaint"
  | "refund"
  | "legal"
  | "safety"
  | "unknown";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface ClassifierResult {
  readonly intent: IntentLabel;
  readonly risk: RiskLevel;
  readonly requiresEscalation: boolean;
  readonly source: "model" | "deterministic_fallback";
  readonly matchedRules: readonly string[];
}

export interface IntentClassifierPort {
  classify(input: string): Promise<ClassifierResult>;
}

const ESCALATION_KEYWORDS: ReadonlyArray<{ readonly pattern: RegExp; readonly rule: string }> = [
  { pattern: /\b(refund|hoàn tiền|chargeback)\b/i, rule: "refund-keyword" },
  { pattern: /\b(luật sư|kiện|pháp lý|legal)\b/i, rule: "legal-keyword" },
  { pattern: /\b(đe dọa|threat|bạo lực)\b/i, rule: "threat-keyword" },
  { pattern: /\b(khiếu nại|complaint|scam|lừa đảo)\b/i, rule: "complaint-keyword" }
];

export function deterministicClassifierFallback(input: string): ClassifierResult {
  const text = input.trim();
  const matchedRules: string[] = [];
  let intent: IntentLabel = "unknown";
  let risk: RiskLevel = "low";

  if (/\b(xin chào|hello|hi)\b/i.test(text)) intent = "greeting";
  if (/\b(giá|price|tồn kho|stock|sản phẩm|product)\b/i.test(text)) intent = "product_inquiry";
  if (/\b(đơn hàng|order|tracking)\b/i.test(text)) intent = "order_status";

  for (const { pattern, rule } of ESCALATION_KEYWORDS) {
    if (pattern.test(text)) {
      matchedRules.push(rule);
      risk = "high";
      if (rule === "refund-keyword") intent = "refund";
      if (rule === "legal-keyword") intent = "legal";
      if (rule === "threat-keyword") intent = "safety";
      if (rule === "complaint-keyword") intent = "complaint";
    }
  }

  const requiresEscalation = risk === "high" || intent === "complaint" || intent === "legal" || intent === "safety";

  return {
    intent,
    risk,
    requiresEscalation,
    source: "deterministic_fallback",
    matchedRules
  };
}

export class StubIntentClassifier implements IntentClassifierPort {
  async classify(input: string): Promise<ClassifierResult> {
    return deterministicClassifierFallback(input);
  }
}
