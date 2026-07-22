/**
 * BE-CHN-008 — Outbound message state machine (blueprint §10.7).
 */

export type OutboundStatus = "queued" | "sending" | "sent" | "blocked" | "failed" | "cancelled";

const TRANSITIONS: Record<OutboundStatus, readonly OutboundStatus[]> = {
  queued: ["sending", "blocked", "cancelled"],
  sending: ["sent", "queued", "failed", "blocked"],
  sent: [],
  blocked: [],
  failed: ["queued"],
  cancelled: []
};

export function assertOutboundTransition(from: OutboundStatus, to: OutboundStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new Error(`Invalid outbound transition ${from} -> ${to}`);
  }
}

export function canRetryOutbound(status: OutboundStatus): boolean {
  return status === "failed" || status === "queued";
}

export function mapProviderResponseToStatus(responseClass: string): OutboundStatus {
  switch (responseClass) {
    case "success":
      return "sent";
    case "transient":
    case "rate_limited":
      return "queued";
    case "permanent":
      return "failed";
    default:
      return "failed";
  }
}
