import { describe, expect, it } from "vitest";
import { createDatabase } from "@ai-sales/database";
import { PostgresSupportGrantStore } from "./postgres-support-grants.js";

describe("PostgresSupportGrantStore", () => {
  it("constructs without throwing", () => {
    const db = createDatabase("postgres://localhost:5432/test");
    expect(() => new PostgresSupportGrantStore(db)).not.toThrow();
  });
});
