import type { RuntimeConfig } from "@ai-sales/config";

export interface TelemetryReleaseContext {
  releaseVersion: string;
  buildSha: string;
  environment: RuntimeConfig["environment"];
}

// Every error report must carry these three fields (spec 5.3).
export function buildReleaseContext(config: RuntimeConfig): TelemetryReleaseContext {
  return {
    releaseVersion: config.releaseVersion,
    buildSha: config.buildSha,
    environment: config.environment,
  };
}
