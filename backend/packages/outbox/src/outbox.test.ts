import { describe, expect, it } from "vitest";
import { generateUuidV7 } from "@ai-sales/domain-kernel";
import { createTestSecurityContext } from "@ai-sales/test-utils";
import { MemoryInboxConsumer, MemoryOutboxWriter } from "./index.js";

describe("outbox/inbox memory helpers", () => {
  it("appends outbox envelopes in memory", async () => {
    const writer = new MemoryOutboxWriter();
    const ctx = createTestSecurityContext();
    const id = generateUuidV7();
    await writer.append(ctx, {
      event: {
        id,
        type: "demo.created",
        version: 1,
        occurredAt: new Date(),
        tenantId: ctx.tenantId,
        payload: { ok: true }
      },
      aggregateType: "demo",
      aggregateId: id,
      correlationId: ctx.correlationId
    });
    expect(writer.events).toHaveLength(1);
  });

  it("dedupes inbox consumption by event id", async () => {
    const inbox = new MemoryInboxConsumer("demo-consumer");
    const eventId = generateUuidV7();
    let runs = 0;
    expect(await inbox.consume(eventId, async () => {
      runs += 1;
    })).toBe("processed");
    expect(await inbox.consume(eventId, async () => {
      runs += 1;
    })).toBe("duplicate");
    expect(runs).toBe(1);
  });
});
