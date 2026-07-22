import { describe, expect, it, vi } from "vitest";
import { createCrossTabChannel } from "../crossTab";

describe("createCrossTabChannel", () => {
  it("delivers logout messages across channel instances", async () => {
    const name = `test-auth-${crypto.randomUUID()}`;
    const sender = createCrossTabChannel(name);
    const receiver = createCrossTabChannel(name);
    const handler = vi.fn();
    receiver.subscribe(handler);

    sender.postMessage({ type: "logout" });

    await vi.waitFor(() => {
      expect(handler).toHaveBeenCalledWith({ type: "logout" });
    });

    sender.close();
    receiver.close();
  });
});
