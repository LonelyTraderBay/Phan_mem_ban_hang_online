import type { ApiClient } from "@ai-sales/api-client";
import type { QueryClient } from "@tanstack/react-query";
import { clearAllCaches } from "@ai-sales/state";
import { bootstrapSession } from "./bootstrap";
import type { SessionBootstrap } from "./schemas";

export interface TenantSwitchDeps {
  apiClient: ApiClient;
  queryClient: QueryClient;
  /** Stop the current SSE connection — injected rather than imported to avoid a dependency
   * cycle with packages/realtime, which itself depends on packages/auth. */
  stopRealtime: () => void;
  /** Open a new SSE connection for the freshly-bootstrapped session. */
  startRealtime: () => void;
  /** Clear local client store state, draft namespace, and telemetry context. */
  clearLocalState: () => void;
}

export type TenantSwitchResult =
  | { ok: true; session: SessionBootstrap }
  | { ok: false; reason: "switch_failed" | "rebootstrap_failed" };

/**
 * Tenant switching (spec 9.8) — never just swaps `tenant_id` client-side. Runs the full
 * 6-step sequence: call the switch-tenant endpoint (`/auth/switch-tenant`, operationId
 * `switchTenant`), stop the old SSE, cancel in-flight requests + clear query cache, clear
 * local store/draft/telemetry context, re-bootstrap `/me`, open a new SSE.
 */
export async function switchTenant(tenantId: string, deps: TenantSwitchDeps): Promise<TenantSwitchResult> {
  const switchResult = await deps.apiClient.request("/auth/switch-tenant", {
    method: "POST",
    body: { tenant_id: tenantId },
  });
  if (!switchResult.ok) {
    return { ok: false, reason: "switch_failed" };
  }

  deps.stopRealtime();
  await clearAllCaches(deps.queryClient);
  deps.clearLocalState();

  const bootstrapResult = await bootstrapSession(deps.apiClient);
  if (!bootstrapResult.ok) {
    return { ok: false, reason: "rebootstrap_failed" };
  }

  deps.startRealtime();

  return { ok: true, session: bootstrapResult.session };
}
