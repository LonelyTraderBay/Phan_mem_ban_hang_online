import { runtimeConfigSchema, type RuntimeConfig } from "./schema";

export type LoadRuntimeConfigResult =
  | { ok: true; config: RuntimeConfig }
  | { ok: false; error: string };

/**
 * Fetches and validates `/runtime-config.json` same-origin (spec 5.2). Never throws — callers
 * (app bootstrap) must render `FatalConfigurationScreen` on `{ ok: false }` rather than continue
 * with an unvalidated or partial config (spec 5.2: "Sai config → FatalConfigurationScreen").
 */
export async function loadRuntimeConfig(
  fetchImpl: typeof fetch = fetch,
): Promise<LoadRuntimeConfigResult> {
  let response: Response;
  try {
    response = await fetchImpl("/runtime-config.json", { credentials: "same-origin" });
  } catch (cause) {
    return { ok: false, error: `Network error loading runtime-config.json: ${String(cause)}` };
  }

  if (!response.ok) {
    return { ok: false, error: `runtime-config.json responded with HTTP ${response.status}` };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (cause) {
    return { ok: false, error: `runtime-config.json is not valid JSON: ${String(cause)}` };
  }

  const parsed = runtimeConfigSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: `runtime-config.json failed schema validation: ${parsed.error.message}` };
  }

  return { ok: true, config: parsed.data };
}
