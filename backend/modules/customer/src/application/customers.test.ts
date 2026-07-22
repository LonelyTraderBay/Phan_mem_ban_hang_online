import { describe, expect, it } from "vitest";
import { generateUuidV7 } from "@ai-sales/domain-kernel";
import {
  addCustomerIdentity,
  computeMergeConfirmationToken,
  createCustomer,
  getCustomer,
  listCustomers,
  mergeCustomers,
  previewCustomerMerge,
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

describe("BE-CUS-004 customer merge", () => {
  const mergePerms = ["customer.merge", "customer.read", "customer.write", "customer.pii.read"];
  const actorId = generateUuidV7();

  it("previews merge without mutating sources", async () => {
    const repo = new InMemoryCustomerRepository();
    const survivor = await createCustomer({
      repo,
      tenantId: TENANT_A,
      actorPermissions: mergePerms,
      idempotencyKey: "s1",
      displayName: "Survivor",
      primaryEmail: "s@example.com"
    });
    const source = await createCustomer({
      repo,
      tenantId: TENANT_A,
      actorPermissions: mergePerms,
      idempotencyKey: "m1",
      displayName: "Source",
      primaryPhone: "+84901110000"
    });
    const preview = await previewCustomerMerge({
      repo,
      tenantId: TENANT_A,
      actorPermissions: mergePerms,
      survivorId: String(survivor.data.id),
      mergeIds: [String(source.data.id)]
    });
    expect(preview.data.id).toBe(survivor.data.id);
    const stillActive = await getCustomer({
      repo,
      tenantId: TENANT_A,
      customerId: String(source.data.id),
      actorPermissions: mergePerms
    });
    expect(stillActive.data.status).toBe("active");
  });

  it("merges sources into survivor, history and outbox", async () => {
    const repo = new InMemoryCustomerRepository();
    const survivor = await createCustomer({
      repo,
      tenantId: TENANT_A,
      actorPermissions: mergePerms,
      idempotencyKey: "s2",
      displayName: "Survivor"
    });
    const source = await createCustomer({
      repo,
      tenantId: TENANT_A,
      actorPermissions: mergePerms,
      idempotencyKey: "m2",
      displayName: "Source",
      primaryEmail: "from-source@example.com",
      tags: ["lead"]
    });
    await addCustomerIdentity({
      repo,
      tenantId: TENANT_A,
      customerId: String(source.data.id),
      actorPermissions: mergePerms,
      idempotencyKey: "id-src",
      type: "external",
      value: "zalo:99"
    });
    const survivorId = String(survivor.data.id);
    const mergeIds = [String(source.data.id)];
    const token = computeMergeConfirmationToken(survivorId, mergeIds);
    const merged = await mergeCustomers({
      repo,
      tenantId: TENANT_A,
      actorId,
      actorPermissions: mergePerms,
      idempotencyKey: "merge-1",
      survivorId,
      mergeIds,
      confirmationToken: token
    });
    expect(merged.data.id).toBe(survivorId);
    expect(merged.data.primary_email).toBe("from-source@example.com");
    expect(merged.data.tags).toEqual(expect.arrayContaining(["lead"]));

    const sourceAfter = await getCustomer({
      repo,
      tenantId: TENANT_A,
      customerId: mergeIds[0]!,
      actorPermissions: mergePerms
    });
    expect(sourceAfter.data.status).toBe("merged");
    expect(repo.mergeHistory).toHaveLength(1);
    expect(repo.mergeHistory[0]?.targetCustomerId).toBe(survivorId);
    expect(repo.mergeOutbox[0]?.type).toBe("com.aisales.customer.merged.v1");
    expect(repo.mergeOutbox[0]?.source_ids).toEqual(mergeIds);
  });

  it("replays merge with same Idempotency-Key", async () => {
    const repo = new InMemoryCustomerRepository();
    const survivor = await createCustomer({
      repo,
      tenantId: TENANT_A,
      actorPermissions: mergePerms,
      idempotencyKey: "s3",
      displayName: "S"
    });
    const source = await createCustomer({
      repo,
      tenantId: TENANT_A,
      actorPermissions: mergePerms,
      idempotencyKey: "m3",
      displayName: "M"
    });
    const survivorId = String(survivor.data.id);
    const mergeIds = [String(source.data.id)];
    const token = computeMergeConfirmationToken(survivorId, mergeIds);
    const first = await mergeCustomers({
      repo,
      tenantId: TENANT_A,
      actorId,
      actorPermissions: mergePerms,
      idempotencyKey: "idem-merge",
      survivorId,
      mergeIds,
      confirmationToken: token
    });
    const second = await mergeCustomers({
      repo,
      tenantId: TENANT_A,
      actorId,
      actorPermissions: mergePerms,
      idempotencyKey: "idem-merge",
      survivorId,
      mergeIds,
      confirmationToken: token
    });
    expect(second.data.id).toBe(first.data.id);
    expect(repo.mergeHistory).toHaveLength(1);
  });

  it("rejects bad confirmation_token", async () => {
    const repo = new InMemoryCustomerRepository();
    const survivor = await createCustomer({
      repo,
      tenantId: TENANT_A,
      actorPermissions: mergePerms,
      idempotencyKey: "s4",
      displayName: "S"
    });
    const source = await createCustomer({
      repo,
      tenantId: TENANT_A,
      actorPermissions: mergePerms,
      idempotencyKey: "m4",
      displayName: "M"
    });
    await expect(
      mergeCustomers({
        repo,
        tenantId: TENANT_A,
        actorId,
        actorPermissions: mergePerms,
        idempotencyKey: "bad-token",
        survivorId: String(survivor.data.id),
        mergeIds: [String(source.data.id)],
        confirmationToken: "not-the-checksum"
      })
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("rejects already-merged source", async () => {
    const repo = new InMemoryCustomerRepository();
    const survivor = await createCustomer({
      repo,
      tenantId: TENANT_A,
      actorPermissions: mergePerms,
      idempotencyKey: "s5",
      displayName: "S"
    });
    const source = await createCustomer({
      repo,
      tenantId: TENANT_A,
      actorPermissions: mergePerms,
      idempotencyKey: "m5",
      displayName: "M"
    });
    const other = await createCustomer({
      repo,
      tenantId: TENANT_A,
      actorPermissions: mergePerms,
      idempotencyKey: "o5",
      displayName: "O"
    });
    const survivorId = String(survivor.data.id);
    const sourceId = String(source.data.id);
    await mergeCustomers({
      repo,
      tenantId: TENANT_A,
      actorId,
      actorPermissions: mergePerms,
      idempotencyKey: "first-merge",
      survivorId,
      mergeIds: [sourceId],
      confirmationToken: computeMergeConfirmationToken(survivorId, [sourceId])
    });
    await expect(
      mergeCustomers({
        repo,
        tenantId: TENANT_A,
        actorId,
        actorPermissions: mergePerms,
        idempotencyKey: "second-merge",
        survivorId: String(other.data.id),
        mergeIds: [sourceId],
        confirmationToken: computeMergeConfirmationToken(String(other.data.id), [sourceId])
      })
    ).rejects.toMatchObject({ code: "CUSTOMER_MERGE_CONFLICT" });
  });

  it("denies merge without customer.merge", async () => {
    const repo = new InMemoryCustomerRepository();
    const survivor = await createCustomer({
      repo,
      tenantId: TENANT_A,
      actorPermissions: ["customer.write"],
      idempotencyKey: "s6",
      displayName: "S"
    });
    const source = await createCustomer({
      repo,
      tenantId: TENANT_A,
      actorPermissions: ["customer.write"],
      idempotencyKey: "m6",
      displayName: "M"
    });
    await expect(
      previewCustomerMerge({
        repo,
        tenantId: TENANT_A,
        actorPermissions: ["customer.write"],
        survivorId: String(survivor.data.id),
        mergeIds: [String(source.data.id)]
      })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_PERMISSION" });
  });

  it("isolates merge by tenant", async () => {
    const repo = new InMemoryCustomerRepository();
    const survivor = await createCustomer({
      repo,
      tenantId: TENANT_A,
      actorPermissions: mergePerms,
      idempotencyKey: "sa",
      displayName: "A"
    });
    const otherTenant = await createCustomer({
      repo,
      tenantId: TENANT_B,
      actorPermissions: mergePerms,
      idempotencyKey: "sb",
      displayName: "B"
    });
    await expect(
      previewCustomerMerge({
        repo,
        tenantId: TENANT_A,
        actorPermissions: mergePerms,
        survivorId: String(survivor.data.id),
        mergeIds: [String(otherTenant.data.id)]
      })
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });
});
