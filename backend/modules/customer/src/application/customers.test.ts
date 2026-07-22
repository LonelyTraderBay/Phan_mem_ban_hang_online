import { describe, expect, it } from "vitest";
import { generateUuidV7 } from "@ai-sales/domain-kernel";
import {
  addCustomerIdentity,
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

describe("BE-CUS-003 identity attach/dedupe", () => {
  it("attaches email identity and fills primary_email when empty", async () => {
    const repo = new InMemoryCustomerRepository();
    const created = await createCustomer({
      repo,
      tenantId: TENANT_A,
      actorPermissions: ["customer.write", "customer.pii.read"],
      idempotencyKey: "c-1",
      displayName: "A"
    });
    const id = String(created.data.id);
    const attached = await addCustomerIdentity({
      repo,
      tenantId: TENANT_A,
      customerId: id,
      actorPermissions: ["customer.write", "customer.pii.read"],
      idempotencyKey: "id-1",
      type: "email",
      value: "A@Example.com"
    });
    expect(attached.data.primary_email).toBe("a@example.com");
  });

  it("conflicts when identity belongs to another customer", async () => {
    const repo = new InMemoryCustomerRepository();
    const a = await createCustomer({
      repo,
      tenantId: TENANT_A,
      actorPermissions: ["customer.write"],
      idempotencyKey: "ca",
      displayName: "A"
    });
    const b = await createCustomer({
      repo,
      tenantId: TENANT_A,
      actorPermissions: ["customer.write"],
      idempotencyKey: "cb",
      displayName: "B"
    });
    await addCustomerIdentity({
      repo,
      tenantId: TENANT_A,
      customerId: String(a.data.id),
      actorPermissions: ["customer.write"],
      idempotencyKey: "ia",
      type: "phone",
      value: "+84901112233"
    });
    await expect(
      addCustomerIdentity({
        repo,
        tenantId: TENANT_A,
        customerId: String(b.data.id),
        actorPermissions: ["customer.write"],
        idempotencyKey: "ib",
        type: "phone",
        value: "+84901112233"
      })
    ).rejects.toMatchObject({ code: "CUSTOMER_IDENTITY_CONFLICT" });
  });

  it("same customer re-attach is idempotent success", async () => {
    const repo = new InMemoryCustomerRepository();
    const created = await createCustomer({
      repo,
      tenantId: TENANT_A,
      actorPermissions: ["customer.write"],
      idempotencyKey: "c-same",
      displayName: "Same"
    });
    const id = String(created.data.id);
    const first = await addCustomerIdentity({
      repo,
      tenantId: TENANT_A,
      customerId: id,
      actorPermissions: ["customer.write"],
      idempotencyKey: "ext-1",
      type: "external",
      value: "fb:123"
    });
    const second = await addCustomerIdentity({
      repo,
      tenantId: TENANT_A,
      customerId: id,
      actorPermissions: ["customer.write"],
      idempotencyKey: "ext-2",
      type: "external",
      value: "fb:123"
    });
    expect(second.data.id).toBe(first.data.id);
  });

  it("denies attach without customer.write", async () => {
    const repo = new InMemoryCustomerRepository();
    const created = await createCustomer({
      repo,
      tenantId: TENANT_A,
      actorPermissions: ["customer.write"],
      idempotencyKey: "c-deny",
      displayName: "X"
    });
    await expect(
      addCustomerIdentity({
        repo,
        tenantId: TENANT_A,
        customerId: String(created.data.id),
        actorPermissions: ["customer.read"],
        idempotencyKey: "no-write",
        type: "email",
        value: "x@example.com"
      })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_PERMISSION" });
  });

  it("isolates identity lookup by tenant", async () => {
    const repo = new InMemoryCustomerRepository();
    const a = await createCustomer({
      repo,
      tenantId: TENANT_A,
      actorPermissions: ["customer.write"],
      idempotencyKey: "ta",
      displayName: "A"
    });
    const b = await createCustomer({
      repo,
      tenantId: TENANT_B,
      actorPermissions: ["customer.write"],
      idempotencyKey: "tb",
      displayName: "B"
    });
    await addCustomerIdentity({
      repo,
      tenantId: TENANT_A,
      customerId: String(a.data.id),
      actorPermissions: ["customer.write"],
      idempotencyKey: "ia",
      type: "email",
      value: "shared@example.com"
    });
    const other = await addCustomerIdentity({
      repo,
      tenantId: TENANT_B,
      customerId: String(b.data.id),
      actorPermissions: ["customer.write", "customer.pii.read"],
      idempotencyKey: "ib",
      type: "email",
      value: "shared@example.com"
    });
    expect(other.data.primary_email).toBe("shared@example.com");
  });

  it("requires Idempotency-Key on attach", async () => {
    const repo = new InMemoryCustomerRepository();
    const created = await createCustomer({
      repo,
      tenantId: TENANT_A,
      actorPermissions: ["customer.write"],
      idempotencyKey: "c-idem",
      displayName: "I"
    });
    await expect(
      addCustomerIdentity({
        repo,
        tenantId: TENANT_A,
        customerId: String(created.data.id),
        actorPermissions: ["customer.write"],
        idempotencyKey: undefined,
        type: "email",
        value: "i@example.com"
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REQUIRED" });
  });
});
