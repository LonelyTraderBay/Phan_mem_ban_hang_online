import { describe, expect, it } from "vitest";
import { IllegalAuthTransitionError, transitionAuthStatus } from "../authStateMachine";

describe("transitionAuthStatus", () => {
  it("walks the full happy path from spec 9.4", () => {
    let status = transitionAuthStatus("unknown", { type: "BOOTSTRAP_START" });
    expect(status).toBe("bootstrapping");
    status = transitionAuthStatus(status, { type: "BOOTSTRAP_RESULT_ANONYMOUS" });
    expect(status).toBe("anonymous");
    status = transitionAuthStatus(status, { type: "LOGIN_START" });
    expect(status).toBe("authenticating");
    status = transitionAuthStatus(status, { type: "LOGIN_STEP_UP_REQUIRED" });
    expect(status).toBe("partially_authenticated");
    status = transitionAuthStatus(status, { type: "LOGIN_SUCCESS" });
    expect(status).toBe("authenticated");
    status = transitionAuthStatus(status, { type: "REFRESH_START" });
    expect(status).toBe("refreshing");
    status = transitionAuthStatus(status, { type: "REFRESH_FAILURE" });
    expect(status).toBe("expired");
    status = transitionAuthStatus(status, { type: "LOGOUT_START" });
    expect(status).toBe("signing_out");
    status = transitionAuthStatus(status, { type: "LOGOUT_COMPLETE" });
    expect(status).toBe("anonymous");
  });

  it("rejects an illegal transition instead of silently ignoring it", () => {
    expect(() => transitionAuthStatus("anonymous", { type: "REFRESH_START" })).toThrow(
      IllegalAuthTransitionError,
    );
  });

  it("never lets refreshing loop back to itself (no infinite refresh loop)", () => {
    const fromRefreshing = transitionAuthStatus("refreshing", { type: "REFRESH_SUCCESS" });
    expect(fromRefreshing).not.toBe("refreshing");
    expect(() => transitionAuthStatus("refreshing", { type: "REFRESH_START" })).toThrow();
  });

  it("supports session revoke and re-login after expiry", () => {
    expect(transitionAuthStatus("authenticated", { type: "SESSION_REVOKED" })).toBe("revoked");
    expect(transitionAuthStatus("expired", { type: "LOGIN_START" })).toBe("authenticating");
  });
});
