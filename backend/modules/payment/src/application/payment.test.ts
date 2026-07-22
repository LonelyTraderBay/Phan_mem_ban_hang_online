import { describe, expect, it } from "vitest";
import { parseUuidV7 } from "@ai-sales/domain-kernel";
import {
  confirmPayment,
  createRefund,
  normalizeProviderCallbackStub,
  processProviderCallbackStub,
  recordPayment,
  verifyProviderCallbackSignatureStub
} from "./payment.js";
import { InMemoryPaymentRepository } from "../infrastructure/persistence/in-memory-payment.js";

const tenantA = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e1b");
const actorId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e2b");
const orderId = parseUuidV7("018f65fd-7c6a-7cc8-9f68-9f5f2c7b7e3b");

const payPerms = ["payment.read", "payment.record", "payment.refund"];

const orders = {
  async getOrderGrandTotal() {
    return { grandTotalMinor: 110_000, currency: "VND" };
  }
};

describe("BE-PAY manual payment + callback stub", () => {
  it("records and confirms manual payment", async () => {
    const repo = new InMemoryPaymentRepository();
    const recorded = await recordPayment({
      repo,
      orders,
      tenantId: tenantA,
      orderId,
      actorId,
      actorPermissions: payPerms,
      idempotencyKey: "pay-1",
      amountMinor: 110_000,
      currency: "VND",
      method: "transfer"
    });
    const paymentId = recorded.data.id as string;
    const confirmed = await confirmPayment({
      repo,
      tenantId: tenantA,
      paymentId,
      actorId,
      actorPermissions: payPerms,
      idempotencyKey: "pay-conf-1",
      expectedVersion: 1,
      providerRef: "TXN-001"
    });
    expect(confirmed.data.status).toBe("captured");
  });

  it("refund cannot exceed captured amount", async () => {
    const repo = new InMemoryPaymentRepository();
    const recorded = await recordPayment({
      repo,
      orders,
      tenantId: tenantA,
      orderId,
      actorId,
      actorPermissions: payPerms,
      idempotencyKey: "pay-2",
      amountMinor: 50_000,
      currency: "VND",
      method: "transfer"
    });
    const paymentId = recorded.data.id as string;
    await confirmPayment({
      repo,
      tenantId: tenantA,
      paymentId,
      actorId,
      actorPermissions: payPerms,
      idempotencyKey: "pay-conf-2",
      expectedVersion: 1
    });
    await expect(
      createRefund({
        repo,
        tenantId: tenantA,
        paymentId,
        actorId,
        actorPermissions: payPerms,
        idempotencyKey: "ref-1",
        amountMinor: 60_000,
        reason: "over"
      })
    ).rejects.toMatchObject({ code: "PAYMENT_AMOUNT_MISMATCH" });
  });

  it("provider callback stub is idempotent by event_id", async () => {
    const repo = new InMemoryPaymentRepository();
    const recorded = await recordPayment({
      repo,
      orders,
      tenantId: tenantA,
      orderId,
      actorId,
      actorPermissions: payPerms,
      idempotencyKey: "pay-3",
      amountMinor: 110_000,
      currency: "VND",
      method: "card"
    });
    const paymentId = recorded.data.id as string;
    const body = {
      payment_id: paymentId,
      tenant_id: tenantA,
      event_id: "evt-1",
      amount_minor: 110_000,
      currency: "VND",
      status: "captured"
    };
    expect(normalizeProviderCallbackStub("vnpay", body)?.providerEventId).toBe("evt-1");
    const first = await processProviderCallbackStub({
      repo,
      provider: "vnpay",
      rawBody: JSON.stringify(body),
      body,
      idempotencyKey: "cb-1"
    });
    const second = await processProviderCallbackStub({
      repo,
      provider: "vnpay",
      rawBody: JSON.stringify(body),
      body,
      idempotencyKey: "cb-2"
    });
    expect(second.meta.replay).toBe(true);
    expect(second.data.id).toBe(first.data.id);
  });

  it("verifyProviderCallbackSignatureStub accepts valid stub signature", () => {
    const raw = '{"ok":true}';
    const sig = `stub-vnpay-${raw.length}`;
    expect(verifyProviderCallbackSignatureStub({ provider: "vnpay", rawBody: raw, signature: sig })).toBe(
      true
    );
  });
});
