import type { ApiClient } from "@ai-sales/api-client";
import { sessionBootstrapSchema, type SessionBootstrap } from "./schemas";

export type BootstrapResult =
  | { ok: true; session: SessionBootstrap }
  | { ok: false; reason: "unauthenticated" | "network" | "invalid_schema" };

/**
 * Calls `GET /me` (spec 9.3's session bootstrap contract; the real OpenAPI operationId is
 * `getCurrentContext` — confirmed against contracts/openapi/tenant-api.yaml, which still
 * returns a generic response wrapper at this stage of the backend contract, so this Zod schema
 * is the actual source of shape validation, not the generated OpenAPI type).
 */
export async function bootstrapSession(apiClient: ApiClient): Promise<BootstrapResult> {
  const result = await apiClient.request<unknown>("/me", { method: "GET" });

  if (!result.ok) {
    if (result.status === 401) return { ok: false, reason: "unauthenticated" };
    return { ok: false, reason: "network" };
  }

  const parsed = sessionBootstrapSchema.safeParse(result.data);
  if (!parsed.success) {
    return { ok: false, reason: "invalid_schema" };
  }

  return { ok: true, session: parsed.data };
}
