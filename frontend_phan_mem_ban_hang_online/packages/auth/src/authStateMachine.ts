/**
 * Auth state machine (spec 9.4). Every transition must have UI and a test; no infinite refresh
 * loop is possible — `refreshing` only ever resolves to `authenticated` or `expired`.
 */

export type AuthStatus =
  | "unknown"
  | "bootstrapping"
  | "anonymous"
  | "authenticating"
  | "partially_authenticated"
  | "authenticated"
  | "refreshing"
  | "expired"
  | "revoked"
  | "signing_out";

export type AuthEvent =
  | { type: "BOOTSTRAP_START" }
  | { type: "BOOTSTRAP_RESULT_ANONYMOUS" }
  | { type: "BOOTSTRAP_RESULT_AUTHENTICATED" }
  | { type: "LOGIN_START" }
  | { type: "LOGIN_STEP_UP_REQUIRED" }
  | { type: "LOGIN_SUCCESS" }
  | { type: "REFRESH_START" }
  | { type: "REFRESH_SUCCESS" }
  | { type: "REFRESH_FAILURE" }
  | { type: "SESSION_EXPIRED" }
  | { type: "SESSION_REVOKED" }
  | { type: "LOGOUT_START" }
  | { type: "LOGOUT_COMPLETE" };

type EventType = AuthEvent["type"];

const TRANSITIONS: Record<AuthStatus, Partial<Record<EventType, AuthStatus>>> = {
  unknown: {
    BOOTSTRAP_START: "bootstrapping",
  },
  bootstrapping: {
    BOOTSTRAP_RESULT_ANONYMOUS: "anonymous",
    BOOTSTRAP_RESULT_AUTHENTICATED: "authenticated",
  },
  anonymous: {
    LOGIN_START: "authenticating",
  },
  authenticating: {
    LOGIN_STEP_UP_REQUIRED: "partially_authenticated",
    LOGIN_SUCCESS: "authenticated",
  },
  partially_authenticated: {
    LOGIN_SUCCESS: "authenticated",
    LOGOUT_START: "signing_out",
  },
  authenticated: {
    REFRESH_START: "refreshing",
    SESSION_EXPIRED: "expired",
    SESSION_REVOKED: "revoked",
    LOGOUT_START: "signing_out",
  },
  refreshing: {
    REFRESH_SUCCESS: "authenticated",
    REFRESH_FAILURE: "expired",
  },
  expired: {
    LOGIN_START: "authenticating",
    LOGOUT_START: "signing_out",
  },
  revoked: {
    LOGOUT_START: "signing_out",
  },
  signing_out: {
    LOGOUT_COMPLETE: "anonymous",
  },
};

export class IllegalAuthTransitionError extends Error {
  constructor(
    public readonly from: AuthStatus,
    public readonly event: EventType,
  ) {
    super(`Illegal auth transition: cannot handle "${event}" from state "${from}"`);
    this.name = "IllegalAuthTransitionError";
  }
}

export function transitionAuthStatus(current: AuthStatus, event: AuthEvent): AuthStatus {
  const next = TRANSITIONS[current]?.[event.type];
  if (!next) {
    throw new IllegalAuthTransitionError(current, event.type);
  }
  return next;
}
