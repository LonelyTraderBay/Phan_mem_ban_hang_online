import { describe, expect, it } from "vitest";
import { generateUuidV7, parseUuidV7 } from "./index.js";

describe("generateUuidV7", () => {
  it("returns a valid UUIDv7", () => {
    const id = generateUuidV7();
    expect(parseUuidV7(id)).toBe(id);
  });
});
