import { describe, expect, it } from "vitest";
import { canonicalize, createResourceQueryKeys } from "../queryKeys";

describe("canonicalize", () => {
  it("produces the same string regardless of key order", () => {
    expect(canonicalize({ b: 2, a: 1 })).toBe(canonicalize({ a: 1, b: 2 }));
  });

  it("drops undefined values", () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe(canonicalize({ a: 1 }));
  });
});

describe("createResourceQueryKeys", () => {
  const conversationKeys = createResourceQueryKeys("conversations");

  it("always includes the tenant scope", () => {
    expect(conversationKeys.all("ten_1")).toEqual(["tenant", "ten_1", "conversations"]);
  });

  it("builds list keys with canonicalized filters", () => {
    const a = conversationKeys.list("ten_1", { status: "open", assignee: "me" });
    const b = conversationKeys.list("ten_1", { assignee: "me", status: "open" });
    expect(a).toEqual(b);
  });

  it("builds detail keys scoped by tenant and id", () => {
    expect(conversationKeys.detail("ten_1", "con_1")).toEqual(["tenant", "ten_1", "conversations", "detail", "con_1"]);
  });
});
