import { describe, expect, it } from "vitest";
import { generateUuidV7 } from "@ai-sales/domain-kernel";
import {
  createCustomer,
  getCustomer,
  listCustomers,
  updateCustomer,
  CustomerError
} from "./customers.js";
import { InMemoryCustomerRepository } from "../infrastructure/persistence/in-memory-customers.js";

const TENANT_A = generateUuidV7();
const TENANT_B = generateUuidV7();

describe("BE-CUS-002 customers", () => {
  it("creates and lists customers with PII when actor has customer.pii.read", async () => {
    const repo = new InMemoryCustomerRepository();
    const perms = ["customer.read", "customer.write", "customer.pii.read"];
    const created = await createCustomer({
      repo,
      tenantId: TENANT_A,
      actorPermissions: perms,
      idempotencyKey: "key-1",
      displayName: "Nguyễn Văn A",
      primaryEmail: "a@example.com",
      primaryPhone: "+84901234567",
      tags: ["vip"]
    });
    expect(created.data.primary_email).toBe("a@example.com");
    expect(created.data.primary_phone).toBe("+84901234567");

    const listed = await listCustomers({
      repo,
      tenantId: TENANT_A,
      actorPermissions: perms
    });
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0]?.display_name).toBe("Nguyễn Văn A");
  });

  it("omits PII fields without customer.pii.read", async () => {
    const repo = new InMemoryCustomerRepository();
    const created = await createCustomer({
      repo,
      tenantId: TENANT_A,
      actorPermissions: ["customer.write", "customer.pii.read"],
      idempotencyKey: "key-pii",
      primaryEmail: "secret@example.com",
      primaryPhone: "+84901112233"
    });
    const got = await getCustomer({
      repo,
      tenantId: TENANT_A,
      customerId: String(created.data.id),
      actorPermissions: ["customer.read"]
    });
    expect(got.data.primary_email).toBeUndefined();
    expect(got.data.primary_phone).toBeUndefined();
  });

  it("denies list without customer.read", async () => {
    const repo = new InMemoryCustomerRepository();
    await expect(
      listCustomers({ repo, tenantId: TENANT_A, actorPermissions: ["customer.write"] })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_PERMISSION" });
  });

  it("isolates tenants", async () => {
    const repo = new InMemoryCustomerRepository();
    repo.seed({ tenantId: TENANT_B, displayName: "Other" });
    await createCustomer({
      repo,
      tenantId: TENANT_A,
      actorPermissions: ["customer.write"],
      idempotencyKey: "a-1",
      displayName: "Mine"
    });
    const listed = await listCustomers({
      repo,
      tenantId: TENANT_A,
      actorPermissions: ["customer.read"]
    });
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0]?.display_name).toBe("Mine");
  });

  it("rejects stale expected_version", async () => {
    const repo = new InMemoryCustomerRepository();
    const created = await createCustomer({
      repo,
      tenantId: TENANT_A,
      actorPermissions: ["customer.write"],
      idempotencyKey: "v-1",
      displayName: "V1"
    });
    const id = String(created.data.id);
    await updateCustomer({
      repo,
      tenantId: TENANT_A,
      customerId: id,
      actorPermissions: ["customer.write"],
      expectedVersion: 1,
      displayName: "V2"
    });
    await expect(
      updateCustomer({
        repo,
        tenantId: TENANT_A,
        customerId: id,
        actorPermissions: ["customer.write"],
        expectedVersion: 1,
        displayName: "stale"
      })
    ).rejects.toBeInstanceOf(CustomerError);
    await expect(
      updateCustomer({
        repo,
        tenantId: TENANT_A,
        customerId: id,
        actorPermissions: ["customer.write"],
        expectedVersion: 1,
        displayName: "stale"
      })
    ).rejects.toMatchObject({ code: "RESOURCE_VERSION_MISMATCH" });
  });

  it("replays create with same Idempotency-Key", async () => {
    const repo = new InMemoryCustomerRepository();
    const first = await createCustomer({
      repo,
      tenantId: TENANT_A,
      actorPermissions: ["customer.write"],
      idempotencyKey: "idem-same",
      displayName: "Once"
    });
    const second = await createCustomer({
      repo,
      tenantId: TENANT_A,
      actorPermissions: ["customer.write"],
      idempotencyKey: "idem-same",
      displayName: "Once"
    });
    expect(second.data.id).toBe(first.data.id);
    const listed = await listCustomers({
      repo,
      tenantId: TENANT_A,
      actorPermissions: ["customer.read"]
    });
    expect(listed.data).toHaveLength(1);
  });

  it("requires Idempotency-Key on create", async () => {
    const repo = new InMemoryCustomerRepository();
    await expect(
      createCustomer({
        repo,
        tenantId: TENANT_A,
        actorPermissions: ["customer.write"],
        idempotencyKey: undefined,
        displayName: "No key"
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });
  });
});
