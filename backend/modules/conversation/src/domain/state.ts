/**
 * BE-CON-004 — Multidimensional conversation state handlers (blueprint §7.10.4).
 */

export type LifecycleStatus = "new" | "open" | "resolved" | "archived";
export type WaitingOn = "none" | "customer" | "staff";
export type SalesStage = "none" | "qualified" | "order_draft" | "order_confirmed";
export type EscalationStatus = "normal" | "escalated";
export type AiMode = "off" | "copilot" | "semi_auto" | "autopilot" | "human_takeover";

/** Frozen OpenAPI ConversationResource.status projection. */
export type ConversationApiStatus = "open" | "pending" | "resolved" | "closed";

export interface ConversationStateDimensions {
  readonly lifecycleStatus: LifecycleStatus;
  readonly waitingOn: WaitingOn;
  readonly salesStage: SalesStage;
  readonly escalationStatus: EscalationStatus;
  readonly aiMode: AiMode;
}

export function toApiStatus(state: ConversationStateDimensions): ConversationApiStatus {
  if (state.lifecycleStatus === "archived") return "closed";
  if (state.lifecycleStatus === "resolved") return "resolved";
  if (state.waitingOn === "customer") return "pending";
  return "open";
}

export function assertLifecycleTransition(from: LifecycleStatus, to: LifecycleStatus): void {
  const allowed: Record<LifecycleStatus, readonly LifecycleStatus[]> = {
    new: ["open", "archived"],
    open: ["resolved", "archived"],
    resolved: ["open", "archived"],
    archived: []
  };
  if (!allowed[from].includes(to)) {
    throw new Error(`Invalid lifecycle transition ${from} -> ${to}`);
  }
}

export function canResolve(state: ConversationStateDimensions): boolean {
  return state.lifecycleStatus === "open" || state.lifecycleStatus === "new";
}

export function canReopen(state: ConversationStateDimensions): boolean {
  return state.lifecycleStatus === "resolved";
}

export function canEscalate(state: ConversationStateDimensions): boolean {
  return state.escalationStatus === "normal" && state.lifecycleStatus !== "archived";
}

export function canTakeover(state: ConversationStateDimensions): boolean {
  return state.aiMode !== "human_takeover" && state.lifecycleStatus !== "archived";
}

export function canReleaseTakeover(state: ConversationStateDimensions): boolean {
  return state.aiMode === "human_takeover";
}

export function applyResolve(state: ConversationStateDimensions): ConversationStateDimensions {
  assertLifecycleTransition(state.lifecycleStatus, "resolved");
  return {
    ...state,
    lifecycleStatus: "resolved",
    waitingOn: "none"
  };
}

export function applyReopen(state: ConversationStateDimensions): ConversationStateDimensions {
  assertLifecycleTransition(state.lifecycleStatus, "open");
  return {
    ...state,
    lifecycleStatus: "open",
    waitingOn: "staff"
  };
}

export function applyEscalate(state: ConversationStateDimensions): ConversationStateDimensions {
  if (!canEscalate(state)) {
    throw new Error("Cannot escalate conversation.");
  }
  return { ...state, escalationStatus: "escalated", waitingOn: "staff" };
}

export function applyHumanTakeover(state: ConversationStateDimensions): ConversationStateDimensions {
  if (!canTakeover(state)) {
    throw new Error("Cannot take over conversation.");
  }
  return { ...state, aiMode: "human_takeover", waitingOn: "staff" };
}

export function applyReleaseTakeover(state: ConversationStateDimensions): ConversationStateDimensions {
  if (!canReleaseTakeover(state)) {
    throw new Error("Takeover not active.");
  }
  return { ...state, aiMode: "copilot" };
}

export function onInboundMessage(state: ConversationStateDimensions): ConversationStateDimensions {
  const lifecycleStatus = state.lifecycleStatus === "new" ? "open" : state.lifecycleStatus;
  return {
    ...state,
    lifecycleStatus,
    waitingOn: "staff"
  };
}

export function onOutboundReply(state: ConversationStateDimensions): ConversationStateDimensions {
  return { ...state, waitingOn: "customer" };
}
