import { z } from "zod";

const boolFromEnv = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

const ConfigSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
    SERVICE_NAME: z.string().min(1).default("api"),
    PORT: z.coerce.number().int().positive().default(3000),
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
    DATABASE_URL: z.string().url().optional(),
    WALKING_SKELETON_ENABLED: boolFromEnv,
    REDIS_URL: z.string().url().optional(),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
    /** When false, OIDC routes return 503. */
    OIDC_ENABLED: boolFromEnv,
    OIDC_ISSUER: z.string().url().optional(),
    OIDC_CLIENT_ID: z.string().min(1).optional(),
    OIDC_CLIENT_SECRET: z.string().min(1).optional(),
    OIDC_REDIRECT_URI: z.string().url().optional(),
    OIDC_SCOPES: z.string().min(1).default("openid profile email"),
    OIDC_AUTHORIZATION_ENDPOINT: z.string().url().optional(),
    OIDC_TOKEN_ENDPOINT: z.string().url().optional(),
    SESSION_COOKIE_NAME: z.string().min(1).default("ais_session"),
    SESSION_COOKIE_SECURE: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    SESSION_ABSOLUTE_TTL_HOURS: z.coerce.number().int().positive().default(12),
    REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
    /** Access JWT (BE-IDN-004) — required when JWT_ENABLED=true (desktop/bearer clients). */
    JWT_ENABLED: boolFromEnv,
    JWT_ISSUER: z.string().url().optional(),
    JWT_AUDIENCE: z.string().min(1).optional(),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    JWT_ACTIVE_KID: z.string().min(1).optional(),
    JWT_ACTIVE_PRIVATE_KEY_PEM: z.string().min(1).optional(),
    JWT_PREVIOUS_KID: z.string().min(1).optional(),
    JWT_PREVIOUS_PUBLIC_KEY_PEM: z.string().min(1).optional()
  })
  .superRefine((cfg, ctx) => {
    if (cfg.OIDC_ENABLED) {
      for (const key of ["OIDC_ISSUER", "OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET", "OIDC_REDIRECT_URI"] as const) {
        if (!cfg[key]) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required when OIDC_ENABLED=true`
          });
        }
      }
    }
    if (cfg.JWT_ENABLED) {
      for (const key of ["JWT_ISSUER", "JWT_AUDIENCE", "JWT_ACTIVE_KID", "JWT_ACTIVE_PRIVATE_KEY_PEM"] as const) {
        if (!cfg[key]) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required when JWT_ENABLED=true`
          });
        }
      }
      if ((cfg.JWT_PREVIOUS_KID && !cfg.JWT_PREVIOUS_PUBLIC_KEY_PEM) || (!cfg.JWT_PREVIOUS_KID && cfg.JWT_PREVIOUS_PUBLIC_KEY_PEM)) {
        ctx.addIssue({
          code: "custom",
          path: ["JWT_PREVIOUS_KID"],
          message: "JWT_PREVIOUS_KID and JWT_PREVIOUS_PUBLIC_KEY_PEM must be set together"
        });
      }
    }
  });

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return ConfigSchema.parse(env);
}

export function redactConfig(config: AppConfig): Record<string, string | number | boolean | undefined> {
  return {
    ...config,
    DATABASE_URL: config.DATABASE_URL ? "[redacted]" : undefined,
    REDIS_URL: config.REDIS_URL ? "[redacted]" : undefined,
    OIDC_CLIENT_SECRET: config.OIDC_CLIENT_SECRET ? "[redacted]" : undefined,
    JWT_ACTIVE_PRIVATE_KEY_PEM: config.JWT_ACTIVE_PRIVATE_KEY_PEM ? "[redacted]" : undefined,
    JWT_PREVIOUS_PUBLIC_KEY_PEM: config.JWT_PREVIOUS_PUBLIC_KEY_PEM ? "[redacted]" : undefined
  };
}

export function isOidcConfigured(config: AppConfig): boolean {
  return Boolean(
    config.OIDC_ENABLED &&
      config.OIDC_ISSUER &&
      config.OIDC_CLIENT_ID &&
      config.OIDC_CLIENT_SECRET &&
      config.OIDC_REDIRECT_URI
  );
}

export function isJwtConfigured(config: AppConfig): boolean {
  return Boolean(
    config.JWT_ENABLED &&
      config.JWT_ISSUER &&
      config.JWT_AUDIENCE &&
      config.JWT_ACTIVE_KID &&
      config.JWT_ACTIVE_PRIVATE_KEY_PEM
  );
}

/** Shared Redis connection fields for BullMQ (worker + scheduler). */
export function redisConnectionFromUrl(redisUrl: string): {
  readonly host: string;
  readonly port: number;
  readonly password?: string;
  readonly username?: string;
} {
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    ...(parsed.password ? { password: parsed.password } : {}),
    ...(parsed.username ? { username: parsed.username } : {})
  };
}
