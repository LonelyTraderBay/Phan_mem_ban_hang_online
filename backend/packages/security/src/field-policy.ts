import { hasPermission, type RequestSecurityContext } from "@ai-sales/auth-context";

/**
 * Field-level authorization policies (BE-IDN-012).
 * Cost/PII fields are omitted from responses when the actor lacks the required permission.
 * Never return null placeholders for denied fields — omit the key (existence leak avoidance).
 */

export type FieldPolicyRule = {
  readonly field: string;
  readonly permission: string;
  /** Optional redaction when listing without permission (prefer omit). */
  readonly mode: "omit" | "redact";
  readonly redactValue?: unknown;
};

/** Canonical catalog / customer field policies used across modules. */
export const DEFAULT_FIELD_POLICIES: readonly FieldPolicyRule[] = [
  { field: "cost_minor", permission: "catalog.cost.read", mode: "omit" },
  { field: "cost", permission: "catalog.cost.read", mode: "omit" },
  { field: "profit_minor", permission: "catalog.cost.read", mode: "omit" },
  { field: "primary_phone", permission: "customer.pii.read", mode: "omit" },
  { field: "primary_email", permission: "customer.pii.read", mode: "omit" },
  { field: "tax_id", permission: "customer.pii.read", mode: "omit" },
  { field: "national_id", permission: "customer.pii.read", mode: "omit" }
];

export function fieldsRequiringPermission(
  permission: string,
  policies: readonly FieldPolicyRule[] = DEFAULT_FIELD_POLICIES
): readonly string[] {
  return policies.filter((p) => p.permission === permission).map((p) => p.field);
}

/**
 * Apply field policies: omit or redact restricted fields the actor cannot read.
 * Does not mutate the input object.
 */
export function applyFieldPolicies<T extends Record<string, unknown>>(
  record: T,
  actorPermissions: readonly string[],
  policies: readonly FieldPolicyRule[] = DEFAULT_FIELD_POLICIES
): Partial<T> {
  const out: Record<string, unknown> = { ...record };
  for (const rule of policies) {
    if (!(rule.field in out)) continue;
    const allowed = actorPermissions.includes(rule.permission);
    if (allowed) continue;
    if (rule.mode === "omit") {
      delete out[rule.field];
    } else {
      out[rule.field] = rule.redactValue ?? null;
    }
  }
  return out as Partial<T>;
}

export function applyFieldPoliciesForContext<T extends Record<string, unknown>>(
  record: T,
  ctx: Pick<RequestSecurityContext, "permissions">,
  policies: readonly FieldPolicyRule[] = DEFAULT_FIELD_POLICIES
): Partial<T> {
  return applyFieldPolicies(record, ctx.permissions, policies);
}

/**
 * IDOR-style guard: actor must hold permission to read a restricted field when requesting it explicitly.
 */
export function assertCanReadField(
  ctx: Pick<RequestSecurityContext, "permissions">,
  field: string,
  policies: readonly FieldPolicyRule[] = DEFAULT_FIELD_POLICIES
): void {
  const rule = policies.find((p) => p.field === field);
  if (!rule) return;
  if (!hasPermission(ctx as RequestSecurityContext, rule.permission)) {
    throw new FieldAuthorizationError(field, rule.permission);
  }
}

export class FieldAuthorizationError extends Error {
  constructor(
    readonly field: string,
    readonly permission: string
  ) {
    super(`Field '${field}' requires permission '${permission}'.`);
    this.name = "FieldAuthorizationError";
  }
}

/** Secrets that must never appear in audit export / logs. */
export const SECRET_PAYLOAD_KEYS = [
  "password",
  "password_hash",
  "token",
  "refresh_token",
  "access_token",
  "secret",
  "totp_secret",
  "code_verifier",
  "client_secret"
] as const;

export function redactSecretsDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => redactSecretsDeep(v));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_PAYLOAD_KEYS.includes(k as (typeof SECRET_PAYLOAD_KEYS)[number])) {
        out[k] = "[redacted]";
      } else {
        out[k] = redactSecretsDeep(v);
      }
    }
    return out;
  }
  return value;
}
