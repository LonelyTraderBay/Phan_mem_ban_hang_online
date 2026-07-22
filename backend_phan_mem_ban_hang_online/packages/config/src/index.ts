import { z } from "zod";

const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  SERVICE_NAME: z.string().min(1).default("api"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  DATABASE_URL: z.string().url().optional(),
  WALKING_SKELETON_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  REDIS_URL: z.string().url().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  AI_SERVICE_URL: z.string().url().optional()
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return ConfigSchema.parse(env);
}

export function redactConfig(config: AppConfig): Record<string, string | number | boolean | undefined> {
  return {
    ...config,
    DATABASE_URL: config.DATABASE_URL ? "[redacted]" : undefined,
    REDIS_URL: config.REDIS_URL ? "[redacted]" : undefined
  };
}
