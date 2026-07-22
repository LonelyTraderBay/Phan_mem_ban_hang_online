import { describe, expect, it } from "vitest";
import { MemoryIdempotencyStore } from "@ai-sales/idempotency";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import {
  deterministicProvisionTenantId,
  normalizeProvisionInput,
  provisionTenant,
  TenantProvisionError
} from "./provision-tenant.js";
import { InMemoryTenantProvisionRepository } from "../infrastructure/persistence/in-memory-tenant-provision.repository.js";

const actor = {
  actorType: "user" as const,
  actorId: parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7c1a"),
  permissions: [],
  tenantTimezone: "UTC",
  correlationId: "corr-provision-1"
};

describe("normalizeProvisionInput", () => {
  it("defaults plan_free and lowercases code/email", () => {
    const n = normalizeProvisionInput({
      code: "Acme-Shop",
      name: " Acme ",
      ownerEmail: "Owner@Example.COM"
    });
    expect(n.code).toBe("acme-shop");
    expect(n.ownerEmail).toBe("owner@example.com");
    expect(n.planId).toBe("plan_free");
  });

  it("rejects unknown plan as inactive", () => {
    expect(() =>
      normalizeProvisionInput({
        code: "acme",
        name: "Acme",
        ownerEmail: "a@b.co",
        planId: "plan_enterprise"
      })
    ).toThrow(TenantProvisionError);
  });
});

describe("provisionTenant", () => {
  it("provisions tenant, clones 4 roles, issues owner invite", async () => {
    const repo = new InMemoryTenantProvisionRepository();
    const idem = new MemoryIdempotencyStore();
    const result = await provisionTenant({
      actor,
      input: { code: "acme", name: "Acme", ownerEmail: "owner@acme.test" },
      idempotencyKey: "key-1",
      idempotency: idem,
      repo
    });

    expect(result.status).toBe(201);
    const body = result.body as { data: { tenant: { code: string }; default_role_ids: Record<string, string>; invite_token: string } };
    expect(body.data.tenant.code).toBe("acme");
    expect(body.data.default_role_ids.owner).toBeTruthy();
    expect(body.data.invite_token.length).toBeGreaterThan(16);
    expect(repo.roles).toHaveLength(4);
    expect(repo.invitations).toHaveLength(1);
    expect(repo.outbox[0]?.type).toBe("com.aisales.tenant.activated.v1");
  });

  it("replays identical Idempotency-Key without duplicating tenants", async () => {
    const repo = new InMemoryTenantProvisionRepository();
    const idem = new MemoryIdempotencyStore();
    const args = {
      actor,
      input: { code: "acme2", name: "Acme 2", ownerEmail: "o@acme.test" },
      idempotencyKey: "key-replay",
      idempotency: idem,
      repo
    };
    const first = await provisionTenant(args);
    const second = await provisionTenant(args);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(repo.tenants.size).toBe(1);
  });

  it("conflicts on duplicate tenant code", async () => {
    const repo = new InMemoryTenantProvisionRepository();
    const idem = new MemoryIdempotencyStore();
    await provisionTenant({
      actor,
      input: { code: "dup", name: "One", ownerEmail: "a@b.co" },
      idempotencyKey: "k1",
      idempotency: idem,
      repo
    });
    await expect(
      provisionTenant({
        actor,
        input: { code: "dup", name: "Two", ownerEmail: "c@d.co" },
        idempotencyKey: "k2",
        idempotency: idem,
        repo
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("uses deterministic tenant id for a given actor+idempotency key", () => {
    const a = deterministicProvisionTenantId(actor.actorId, "same");
    const b = deterministicProvisionTenantId(actor.actorId, "same");
    const c = deterministicProvisionTenantId(actor.actorId, "other");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
