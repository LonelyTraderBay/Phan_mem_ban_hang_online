import { z } from "zod";

// Matches spec 5.2 exactly. This file is public config only — never add secrets, tokens,
// or credentials here (spec 5.2's explicit "không được chứa" list).
export const runtimeConfigSchema = z.object({
  environment: z.enum(["local", "dev", "staging", "pilot", "production"]),
  apiBaseUrl: z.string().min(1),
  sseUrl: z.string().min(1),
  oidcClientId: z.string().min(1),
  releaseVersion: z.string().min(1),
  buildSha: z.string().min(1),
  telemetryEnabled: z.boolean(),
  supportUrl: z.string().min(1),
});

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;
export type Environment = RuntimeConfig["environment"];
