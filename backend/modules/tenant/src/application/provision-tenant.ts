import { createHash, randomBytes } from "node:crypto";
import type { RequestSecurityContext } from "@ai-sales/auth-context";
import type { IdempotencyStore } from "@ai-sales/idempotency";
import { generateUuidV7, parseUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";

/** Stable system template role ids from 000005_identity_schema.sql */
export const SYSTEM_ROLE_IDS = {
  Owner: "01900000-0000-7000-8000-000000000001",
  Admin: "01900000-0000-7000-8000-000000000002",
  Staff: "01900000-0000-7000-8000-000000000003",
  ReadOnly: "01900000-0000-7000-8000-000000000004"
} as const;

export const ALLOWED_PLAN_IDS = ["plan_free", "plan_pro", "plan_business"] as const;
export type PlanId = (typeof ALLOWED_PLAN_IDS)[number];

export const PROVISION_IDEMPOTENCY_SCOPE = "tenant.provision";

/** Deterministic tenant id so Idempotency-Key retries share the same RLS/idempotency tenant scope. */
export function deterministicProvisionTenantId(actorId: string, idempotencyKey: string): UuidV7 {
  const hex = createHash("sha256")
    .update(`tenant.provision:${actorId}:${idempotencyKey}`, "utf8")
    .digest("hex");
  return parseUuidV7(
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
  );
}

export class TenantProvisionError extends Error {
  constructor(
    message: string,
    readonly code: "VALIDATION_FAILED" | "CONFLICT" | "INACTIVE_PLAN"
  ) {
    super(message);
    this.name = "TenantProvisionError";
  }
}

export interface ProvisionTenantInput {
  readonly code: string;
  readonly name: string;
  readonly ownerEmail: string;
  readonly timezone?: string | null;
  readonly currency?: string | null;
  readonly locale?: string | null;
  readonly planId?: string | null;
}

export interface ProvisionTenantResult {
  readonly tenant: {
    readonly id: string;
    readonly code: string;
    readonly name: string;
    readonly status: "active";
    readonly plan_id: PlanId;
    readonly version: number;
    readonly created_at: string;
    readonly updated_at: string;
  };
  readonly owner_invitation_id: string;
  readonly invite_token: string;
  readonly default_role_ids: {
    readonly owner: string;
    readonly admin: string;
    readonly staff: string;
    readonly readonly: string;
  };
}

export interface SystemRoleTemplate {
  readonly id: string;
  readonly name: "Owner" | "Admin" | "Staff" | "ReadOnly";
  readonly description: string | null;
  readonly permissionKeys: readonly string[];
}

export interface TenantProvisionRepository {
  findTenantIdByCode(code: string): Promise<string | null>;
  listSystemRoleTemplates(): Promise<SystemRoleTemplate[]>;
  provisionInTenantContext(
    ctx: RequestSecurityContext,
    args: {
      readonly tenant: {
        readonly id: UuidV7;
        readonly code: string;
        readonly name: string;
        readonly timezone: string;
        readonly currency: string;
        readonly locale: string;
        readonly planId: PlanId;
      };
      readonly roles: ReadonlyArray<{
        readonly id: UuidV7;
        readonly name: string;
        readonly description: string | null;
        readonly permissionKeys: readonly string[];
      }>;
      readonly invitation: {
        readonly id: UuidV7;
        readonly email: string;
        readonly tokenHash: string;
        readonly roleIds: readonly string[];
        readonly expiresAt: Date;
      };
      readonly auditId: UuidV7;
      readonly outboxId: UuidV7;
    }
  ): Promise<{ readonly createdAt: Date; readonly updatedAt: Date }>;
}

const CODE_RE = /^[a-z0-9]([a-z0-9-]{0,98}[a-z0-9])?$/;

export function normalizeProvisionInput(input: ProvisionTenantInput): {
  code: string;
  name: string;
  ownerEmail: string;
  timezone: string;
  currency: string;
  locale: string;
  planId: PlanId;
} {
  const code = input.code.trim().toLowerCase();
  const name = input.name.trim();
  const ownerEmail = input.ownerEmail.trim().toLowerCase();
  if (!CODE_RE.test(code)) {
    throw new TenantProvisionError("Invalid tenant code.", "VALIDATION_FAILED");
  }
  if (name.length < 1 || name.length > 200) {
    throw new TenantProvisionError("Invalid tenant name.", "VALIDATION_FAILED");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail) || ownerEmail.length > 320) {
    throw new TenantProvisionError("Invalid owner email.", "VALIDATION_FAILED");
  }
  const planRaw = input.planId == null || input.planId === "" ? "plan_free" : input.planId;
  if (!ALLOWED_PLAN_IDS.includes(planRaw as PlanId)) {
    throw new TenantProvisionError("Plan is inactive or unknown.", "INACTIVE_PLAN");
  }
  return {
    code,
    name,
    ownerEmail,
    timezone: (input.timezone ?? "Asia/Ho_Chi_Minh").trim() || "Asia/Ho_Chi_Minh",
    currency: ((input.currency ?? "VND").trim() || "VND").toUpperCase(),
    locale: (input.locale ?? "vi-VN").trim() || "vi-VN",
    planId: planRaw as PlanId
  };
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashProvisionRequest(input: ReturnType<typeof normalizeProvisionInput>): string {
  return createHash("sha256").update(JSON.stringify(input), "utf8").digest("hex");
}

function mapTemplateNameToKey(name: string): keyof ProvisionTenantResult["default_role_ids"] {
  switch (name) {
    case "Owner":
      return "owner";
    case "Admin":
      return "admin";
    case "Staff":
      return "staff";
    case "ReadOnly":
      return "readonly";
    default:
      throw new TenantProvisionError(`Unexpected system role template: ${name}`, "VALIDATION_FAILED");
  }
}

export async function provisionTenant(options: {
  readonly actor: Omit<RequestSecurityContext, "tenantId"> & { readonly tenantId?: string };
  readonly input: ProvisionTenantInput;
  readonly idempotencyKey: string;
  readonly idempotency: IdempotencyStore;
  readonly repo: TenantProvisionRepository;
  readonly now?: Date;
}): Promise<{ readonly status: 201; readonly body: { data: ProvisionTenantResult; meta: { request_id?: string } } } | { readonly status: number; readonly body: unknown }> {
  const normalized = normalizeProvisionInput(options.input);
  const tenantId = deterministicProvisionTenantId(options.actor.actorId, options.idempotencyKey);
  const ctx: RequestSecurityContext = {
    actorType: options.actor.actorType,
    actorId: options.actor.actorId,
    tenantId,
    permissions: options.actor.permissions,
    tenantTimezone: options.actor.tenantTimezone,
    correlationId: options.actor.correlationId
  };

  const requestHash = hashProvisionRequest(normalized);
  const idemReq = {
    scope: PROVISION_IDEMPOTENCY_SCOPE,
    key: options.idempotencyKey,
    requestHash,
    ttlSeconds: 24 * 60 * 60
  };

  const reserve = await options.idempotency.reserve(ctx, idemReq);
  if (reserve.outcome === "replay") {
    return {
      status: reserve.record.responseStatus ?? 201,
      body: reserve.record.responseBody
    };
  }

  try {
    const existing = await options.repo.findTenantIdByCode(normalized.code);
    if (existing) {
      throw new TenantProvisionError("Tenant code already exists.", "CONFLICT");
    }

    const templates = await options.repo.listSystemRoleTemplates();
    if (templates.length < 4) {
      throw new TenantProvisionError("System role templates missing.", "VALIDATION_FAILED");
    }

    const roleIdsByKey = {
      owner: generateUuidV7(),
      admin: generateUuidV7(),
      staff: generateUuidV7(),
      readonly: generateUuidV7()
    } as const;

    const roles = templates.map((t) => {
      const key = mapTemplateNameToKey(t.name);
      return {
        id: roleIdsByKey[key],
        name: t.name,
        description: t.description,
        permissionKeys: t.permissionKeys
      };
    });

    const ownerRole = roles.find((r) => r.name === "Owner");
    if (!ownerRole) {
      throw new TenantProvisionError("Owner system template missing.", "VALIDATION_FAILED");
    }

    const invitationId = generateUuidV7();
    const inviteToken = createInviteToken();
    const tokenHash = hashInviteToken(inviteToken);
    const now = options.now ?? new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const stamps = await options.repo.provisionInTenantContext(ctx, {
      tenant: {
        id: tenantId,
        code: normalized.code,
        name: normalized.name,
        timezone: normalized.timezone,
        currency: normalized.currency,
        locale: normalized.locale,
        planId: normalized.planId
      },
      roles,
      invitation: {
        id: invitationId,
        email: normalized.ownerEmail,
        tokenHash,
        roleIds: [ownerRole.id],
        expiresAt
      },
      auditId: generateUuidV7(),
      outboxId: generateUuidV7()
    });

    const result: ProvisionTenantResult = {
      tenant: {
        id: tenantId,
        code: normalized.code,
        name: normalized.name,
        status: "active",
        plan_id: normalized.planId,
        version: 1,
        created_at: stamps.createdAt.toISOString(),
        updated_at: stamps.updatedAt.toISOString()
      },
      owner_invitation_id: invitationId,
      invite_token: inviteToken,
      default_role_ids: roleIdsByKey
    };

    const body = { data: result, meta: {} };
    await options.idempotency.complete(ctx, idemReq, {
      resourceId: tenantId,
      responseStatus: 201,
      responseBody: body
    });
    return { status: 201, body };
  } catch (error) {
    const retryable = !(error instanceof TenantProvisionError && (error.code === "CONFLICT" || error.code === "INACTIVE_PLAN" || error.code === "VALIDATION_FAILED"));
    await options.idempotency.fail(ctx, idemReq, { retryable });
    throw error;
  }
}
