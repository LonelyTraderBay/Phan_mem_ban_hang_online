import { z } from "zod";

/**
 * Session bootstrap contract (spec 9.3, reconciled with the shorter example in spec 28.1 —
 * `reauth_required_at` and `entitlements` appear in one excerpt but not the other; both are
 * kept here since a permissive superset is safe for a response schema. Confirm against the
 * live OpenAPI operation for `/session/bootstrap` before this is treated as final.)
 *
 * Permissions are always specific permission strings, never a single role name (spec 9.3:
 * "Không trả permission dưới dạng role name duy nhất").
 */
export const sessionBootstrapSchema = z.object({
  user: z.object({
    id: z.string(),
    display_name: z.string(),
    locale: z.string(),
    timezone: z.string(),
  }),
  tenant: z.object({
    id: z.string(),
    name: z.string(),
    currency: z.string(),
    timezone: z.string(),
  }),
  session: z.object({
    id: z.string(),
    version: z.number(),
    expires_at: z.string(),
    reauth_required_at: z.string().nullable().optional(),
  }),
  device: z.object({
    id: z.string(),
    trusted: z.boolean(),
  }),
  permissions: z.array(z.string()),
  feature_flags: z.record(
    z.string(),
    z.object({ enabled: z.boolean(), variant: z.string().optional() }),
  ),
  entitlements: z.record(z.string(), z.number()).optional(),
});

export type SessionBootstrap = z.infer<typeof sessionBootstrapSchema>;
