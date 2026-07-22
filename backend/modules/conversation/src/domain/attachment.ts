/**
 * BE-CON-011 — Attachment download security / malware scan state stub.
 */

export type MalwareScanState = "pending" | "clean" | "infected" | "failed";

export interface AttachmentSecurityRecord {
  readonly id: string;
  readonly objectKey: string;
  readonly malwareScanState: MalwareScanState;
  readonly expiresAt: string | null;
}

export function canDownloadAttachment(attachment: AttachmentSecurityRecord): boolean {
  if (attachment.malwareScanState !== "clean") return false;
  if (!attachment.expiresAt) return true;
  return new Date(attachment.expiresAt).getTime() > Date.now();
}

export function issueAttachmentDownloadTokenStub(attachment: AttachmentSecurityRecord): string | null {
  if (!canDownloadAttachment(attachment)) return null;
  return `dl-stub:${attachment.id}:${attachment.objectKey}`;
}

export function advanceMalwareScanStub(
  state: MalwareScanState
): MalwareScanState {
  if (state === "pending") return "clean";
  return state;
}
