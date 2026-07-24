import { describe, expect, it } from "vitest";
import {
  getCurrentTenant,
  TenantSettingsError,
  type TenantResource,
  type TenantSettingsRepository,
  updateCurrentTenant
} from "./current-tenant.js";

const tenantId = "01900000-0000-7000-8000-00000000a100";
const createdAt = "2026-01-01T00:00:00.000Z";
const updatedAt = "2026-01-01T00:00:00.000Z";

class FakeTenantSettingsRepository implements TenantSettingsRepository {
  tenant: TenantResource | null = {
    id: tenantId,
    code: "shop_demo",
    name: "Demo Shop",
    status: "active",
    version: 1,
    created_at: createdAt,
    updated_at: updatedAt
  };

  async getCurrentTenant(requestedTenantId: string): Promise<TenantResource | null> {
    return requestedTenantId === this.tenant?.id ? this.tenant : null;
  }

  async updateCurrentTenant(args: {
    readonly tenantId: string;
    readonly expectedVersion: number;
    readonly name: string | null | undefined;
  }): Promise<TenantResource> {
    if (args.tenantId !== this.tenant?.id) {
      throw new TenantSettingsError("Tenant not found.", "RESOURCE_NOT_FOUND");
    }
    if (args.expectedVersion !== this.tenant.version) {
      throw new TenantSettingsError("Tenant version conflict.", "RESOURCE_VERSION_MISMATCH");
    }
    this.tenant = {
      ...this.tenant,
      name: args.name ?? this.tenant.name,
      version: this.tenant.version + 1,
      updated_at: "2026-01-02T00:00:00.000Z"
    };
    return this.tenant;
  }
}

describe("current tenant settings", () => {
  it("requires tenant.read to return current tenant resource", async () => {
    const repo = new FakeTenantSettingsRepository();

    await expect(
      getCurrentTenant({
        repo,
        tenantId,
        actorPermissions: []
      })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_PERMISSION" });

    await expect(
      getCurrentTenant({
        repo,
        tenantId,
        actorPermissions: ["tenant.read"]
      })
    ).resolves.toEqual({
      data: repo.tenant,
      meta: {}
    });
  });

  it("updates current tenant name with expected_version and bumps version", async () => {
    const repo = new FakeTenantSettingsRepository();

    await expect(
      updateCurrentTenant({
        repo,
        tenantId,
        actorPermissions: ["tenant.update"],
        expectedVersion: 1,
        name: "Main Shop"
      })
    ).resolves.toMatchObject({
      data: {
        id: tenantId,
        code: "shop_demo",
        name: "Main Shop",
        status: "active",
        version: 2
      },
      meta: {}
    });
  });

  it("rejects stale expected_version with RESOURCE_VERSION_MISMATCH", async () => {
    const repo = new FakeTenantSettingsRepository();

    await expect(
      updateCurrentTenant({
        repo,
        tenantId,
        actorPermissions: ["tenant.update"],
        expectedVersion: 99,
        name: "Stale"
      })
    ).rejects.toMatchObject({ code: "RESOURCE_VERSION_MISMATCH" });
  });
});
