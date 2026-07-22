import { describe, expect, it } from "vitest";
import { transitionConnectionState } from "../connectionState";

describe("transitionConnectionState", () => {
  it("goes closed -> connecting -> connected on a clean start", () => {
    let state = transitionConnectionState("closed", { type: "START" });
    expect(state).toBe("connecting");
    state = transitionConnectionState(state, { type: "OPENED" });
    expect(state).toBe("connected");
  });

  it("moves to reconnecting on error, then offline after the threshold", () => {
    let state = transitionConnectionState("connected", { type: "ERROR" });
    expect(state).toBe("reconnecting");
    state = transitionConnectionState(state, { type: "OFFLINE_THRESHOLD_EXCEEDED" });
    expect(state).toBe("offline");
  });

  it("ignores an unrecognized event instead of throwing", () => {
    expect(transitionConnectionState("closed", { type: "OPENED" })).toBe("closed");
  });

  it("moves to resyncing and back to connected", () => {
    let state = transitionConnectionState("connected", { type: "RESYNC_REQUIRED" });
    expect(state).toBe("resyncing");
    state = transitionConnectionState(state, { type: "RESYNC_COMPLETE" });
    expect(state).toBe("connected");
  });
});
