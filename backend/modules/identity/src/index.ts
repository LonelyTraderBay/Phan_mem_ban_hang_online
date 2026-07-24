export const MODULE_NAME = "identity" as const;

export {
  startOidcLogin
} from "./application/start-oidc-login.js";
export {
  completeOidcLogin
} from "./application/complete-oidc-login.js";
export {
  getCurrentContext
} from "./application/get-current-context.js";
export {
  assertCsrfDoubleSubmit,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  DEFAULT_SESSION_COOKIE_NAME,
  OidcAuthError,
  createOpaqueToken,
  sha256Hex,
  type OidcClientConfig,
  type SessionBootstrap
} from "./application/oidc-types.js";

export {
  PostgresOidcStateStore,
  PostgresSessionAuthRepository
} from "./infrastructure/persistence/postgres-oidc.js";
export {
  HttpOidcTokenClient,
  resolveOidcEndpoints,
  providerNameFromIssuer
} from "./infrastructure/oidc/http-oidc-token-client.js";
export {
  createOidcAuthController,
  createMeController,
  createRefreshSessionController,
  createSessionDeviceController,
  createPasswordResetController,
  createMfaVerifyController
} from "./presentation/http/oidc.controller.js";

export { createAcceptInvitationController } from "./presentation/http/accept-invitation.controller.js";
export { acceptInvitation, AcceptInvitationError } from "./application/accept-invitation.js";

export { refreshSession } from "./application/refresh-session.js";
export { switchTenant } from "./application/switch-tenant.js";
export {
  logoutSession,
  revokeSession,
  revokeDevice,
  listDevices
} from "./application/logout-revoke.js";

export { requestPasswordReset, resetPassword } from "./application/password-reset.js";
export {
  verifyMfa,
  enrollTotpFactor,
  assertRecentAuth,
  createStepUpMfaChallenge
} from "./application/mfa-verify.js";

export {
  PostgresPasswordResetStore,
  PostgresMfaStore
} from "./infrastructure/persistence/postgres-password-mfa.js";

export { loadAccessTokenService } from "./application/load-access-token-service.js";
