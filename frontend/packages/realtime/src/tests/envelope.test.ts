import { describe, expect, it } from "vitest";
import { createEventDeduper, parseEventEnvelope } from "../envelope";

const validEnvelope = {
  specversion: "1.0",
  id: "evt_1",
  source: "aisales/conversation-service",
  type: "com.aisales.conversation.created.v1",
  time: "2026-06-26T08:30:00.123Z",
  datacontenttype: "application/json",
  tenantid: "ten_1",
  correlationid: "req_abc",
  data: { conversationId: "con_1" },
};

describe("parseEventEnvelope", () => {
  it("parses a valid envelope", () => {
    const result = parseEventEnvelope(JSON.stringify(validEnvelope));
    expect(result?.id).toBe("evt_1");
    expect(result?.type).toBe("com.aisales.conversation.created.v1");
  });

  it("returns null (never throws) for invalid JSON", () => {
    expect(parseEventEnvelope("not json")).toBeNull();
  });

  it("returns null for JSON that does not match the schema", () => {
    expect(parseEventEnvelope(JSON.stringify({ foo: "bar" }))).toBeNull();
  });
});

describe("createEventDeduper", () => {
  it("flags a repeated id as duplicate", () => {
    const deduper = createEventDeduper();
    expect(deduper.isDuplicate("evt_1")).toBe(false);
    expect(deduper.isDuplicate("evt_1")).toBe(true);
  });

  it("evicts the oldest id once the window is exceeded", () => {
    const deduper = createEventDeduper(2);
    deduper.isDuplicate("evt_1");
    deduper.isDuplicate("evt_2");
    deduper.isDuplicate("evt_3"); // evicts evt_1
    expect(deduper.isDuplicate("evt_1")).toBe(false);
  });
});
