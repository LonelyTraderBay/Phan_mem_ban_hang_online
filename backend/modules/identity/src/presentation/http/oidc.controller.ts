import {
  Controller,
  Get,
  Headers,
  Query,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  BadRequestException,
  HttpException,
  Post,
  Body,
  Delete,
  Param,
  HttpCode
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { completeOidcLogin } from "../../application/complete-oidc-login.js";
import { getCurrentContext } from "../../application/get-current-context.js";
import {
  listDevices,
  logoutSession,
  revokeDevice,
  revokeSession
} from "../../application/logout-revoke.js";
import { refreshSession } from "../../application/refresh-session.js";
import { requestPasswordReset, resetPassword } from "../../application/password-reset.js";
import {
  verifyMfa,
  type MfaStore
} from "../../application/mfa-verify.js";
import type { PasswordResetStore } from "../../application/password-reset.js";
import { switchTenant } from "../../application/switch-tenant.js";
import { startOidcLogin } from "../../application/start-oidc-login.js";
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  OidcAuthError,
  type OidcClientConfig,
  type OidcStateStore,
  type OidcTokenClient,
  type SessionAuthRepository
} from "../../application/oidc-types.js";

type HeaderBag = Record<string, string | string[] | undefined>;

function headerString(headers: HeaderBag, name: string): string | undefined {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  return typeof raw === "string" ? raw : undefined;
}

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function setCookie(
  cookies: string[],
  name: string,
  value: string,
  options: { httpOnly: boolean; secure: boolean; maxAgeSeconds: number; path?: string }
): void {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path ?? "/"}`,
    `Max-Age=${options.maxAgeSeconds}`,
    "SameSite=Lax"
  ];
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  cookies.push(parts.join("; "));
}

function mapOidcError(error: unknown): never {
  if (error instanceof OidcAuthError) {
    if (error.code === "OIDC_DISABLED") {
      throw new ServiceUnavailableException({ code: error.code, message: error.message });
    }
    if (error.code === "VALIDATION_FAILED") {
      throw new BadRequestException({ code: error.code, message: error.message });
    }
    if (error.code === "CSRF_TOKEN_INVALID") {
      throw new HttpException({ code: error.code, message: error.message }, 403);
    }
    if (error.code === "DEVICE_ALREADY_REVOKED") {
      throw new HttpException({ code: error.code, message: error.message }, 409);
    }
    if (error.code === "RESOURCE_NOT_FOUND") {
      throw new HttpException({ code: error.code, message: error.message }, 404);
    }
    if (error.code === "NO_MEMBERSHIP") {
      throw new UnauthorizedException({ code: "AUTH_UNAUTHORIZED", message: error.message });
    }
    if (error.code === "MEMBERSHIP_INACTIVE" || error.code === "TENANT_INACTIVE") {
      throw new HttpException({ code: error.code, message: error.message }, 403);
    }
    if (error.code === "TENANT_CONTEXT_INVALID") {
      throw new UnauthorizedException({ code: error.code, message: error.message });
    }
    const status =
      error.code === "AUTH_OIDC_STATE_INVALID" ||
      error.code === "AUTH_OIDC_EXCHANGE_FAILED" ||
      error.code === "AUTH_OIDC_PROVIDER_ERROR" ||
      error.code === "AUTH_UNAUTHORIZED" ||
      error.code === "AUTH_REFRESH_REUSED" ||
      error.code === "AUTH_SESSION_REVOKED" ||
      error.code === "AUTH_MFA_INVALID"
        ? 401
        : error.code === "AUTH_RECENT_AUTH_REQUIRED"
          ? 403
          : 400;
    throw new HttpException({ code: error.code, message: error.message }, status);
  }
  throw error;
}

function clearSessionCookies(
  reply: FastifyReply,
  config: Pick<OidcClientConfig, "sessionCookieName" | "sessionCookieSecure">
): void {
  const cookies: string[] = [];
  setCookie(cookies, config.sessionCookieName, "", {
    httpOnly: true,
    secure: config.sessionCookieSecure,
    maxAgeSeconds: 0
  });
  setCookie(cookies, CSRF_COOKIE_NAME, "", {
    httpOnly: false,
    secure: config.sessionCookieSecure,
    maxAgeSeconds: 0
  });
  reply.header("Set-Cookie", cookies);
}

async function requireActorUserId(
  options: Pick<IdentityHttpOptions, "config" | "sessions">,
  headers: HeaderBag
): Promise<string> {
  const cookieHeader = headerString(headers, "cookie");
  const sessionValue = parseCookie(cookieHeader, options.config.sessionCookieName);
  const me = await getCurrentContext({
    sessions: options.sessions,
    sessionCookieValue: sessionValue
  });
  return me.data.user.id;
}

export interface IdentityHttpOptions {
  readonly config: OidcClientConfig;
  readonly stateStore: OidcStateStore;
  readonly tokenClient: OidcTokenClient;
  readonly sessions: SessionAuthRepository;
  readonly mfa?: MfaStore;
  readonly passwordReset?: PasswordResetStore;
}

export function createOidcAuthController(options: IdentityHttpOptions) {
  @Controller("api/v1/auth/oidc")
  class OidcAuthController {
    @Get("start")
    async start(
      @Query("return_to") returnTo: string | undefined,
      @Query("tenant_hint") tenantHint: string | undefined,
      @Headers() headers: HeaderBag,
      @Res() reply: FastifyReply
    ) {
      try {
        const result = await startOidcLogin({
          config: options.config,
          stateStore: options.stateStore,
          returnTo: returnTo ?? null,
          tenantHint: tenantHint ?? null,
          correlationId: headerString(headers, "x-correlation-id") ?? null
        });
        reply.header("Location", result.location);
        return reply.status(302).send();
      } catch (error) {
        mapOidcError(error);
      }
    }

    @Get("callback")
    async callback(
      @Query("code") code: string | undefined,
      @Query("state") state: string | undefined,
      @Query("error") error: string | undefined,
      @Query("error_description") errorDescription: string | undefined,
      @Headers() headers: HeaderBag,
      @Res() reply: FastifyReply
    ) {
      try {
        const result = await completeOidcLogin({
          config: options.config,
          stateStore: options.stateStore,
          tokenClient: options.tokenClient,
          sessions: options.sessions,
          ...(options.mfa ? { mfa: options.mfa } : {}),
          query: {
            code: code ?? null,
            state: state ?? null,
            error: error ?? null,
            errorDescription: errorDescription ?? null
          },
          correlationId: headerString(headers, "x-correlation-id") ?? null
        });

        if (result.session) {
          const maxAge = options.config.refreshTtlDays * 24 * 60 * 60;
          const cookies: string[] = [];
          setCookie(cookies, options.config.sessionCookieName, result.session.refreshTokenPlaintext, {
            httpOnly: true,
            secure: options.config.sessionCookieSecure,
            maxAgeSeconds: maxAge
          });
          setCookie(cookies, CSRF_COOKIE_NAME, result.session.csrfToken, {
            httpOnly: false,
            secure: options.config.sessionCookieSecure,
            maxAgeSeconds: maxAge
          });
          reply.header("Set-Cookie", cookies);
        }

        reply.header("Location", result.location);
        return reply.status(302).send();
      } catch (error) {
        if (error instanceof OidcAuthError) {
          const codeParam = encodeURIComponent(error.code);
          reply.header("Location", `/login?error=${codeParam}`);
          return reply.status(302).send();
        }
        mapOidcError(error);
      }
    }
  }

  return OidcAuthController;
}

export function createMeController(options: Pick<IdentityHttpOptions, "config" | "sessions">) {
  @Controller("api/v1")
  class MeController {
    @Get("me")
    async me(@Headers() headers: HeaderBag) {
      try {
        const cookieHeader = headerString(headers, "cookie");
        const sessionValue = parseCookie(cookieHeader, options.config.sessionCookieName);
        return await getCurrentContext({
          sessions: options.sessions,
          sessionCookieValue: sessionValue
        });
      } catch (error) {
        mapOidcError(error);
      }
    }
  }

  return MeController;
}

export function createRefreshSessionController(
  options: Pick<IdentityHttpOptions, "config" | "sessions">
) {
  @Controller("api/v1/auth")
  class RefreshSessionController {
    @Post("refresh")
    async refresh(
      @Body() _body: Record<string, never> | undefined,
      @Headers() headers: HeaderBag,
      @Res({ passthrough: true }) reply: FastifyReply
    ) {
      try {
        const cookieHeader = headerString(headers, "cookie");
        const result = await refreshSession({
          config: options.config,
          sessions: options.sessions,
          presentedRefreshToken: parseCookie(cookieHeader, options.config.sessionCookieName),
          csrfCookie: parseCookie(cookieHeader, CSRF_COOKIE_NAME),
          csrfHeader: headerString(headers, CSRF_HEADER_NAME),
          correlationId: headerString(headers, "x-correlation-id") ?? null
        });

        const maxAge = options.config.refreshTtlDays * 24 * 60 * 60;
        const cookies: string[] = [];
        setCookie(cookies, options.config.sessionCookieName, result.newRefreshTokenPlaintext, {
          httpOnly: true,
          secure: options.config.sessionCookieSecure,
          maxAgeSeconds: maxAge
        });
        setCookie(cookies, CSRF_COOKIE_NAME, result.csrfToken, {
          httpOnly: false,
          secure: options.config.sessionCookieSecure,
          maxAgeSeconds: maxAge
        });
        reply.header("Set-Cookie", cookies);
        return result.body;
      } catch (error) {
        mapOidcError(error);
      }
    }

    @Post("logout")
    async logout(
      @Body() _body: Record<string, never> | undefined,
      @Headers() headers: HeaderBag,
      @Res({ passthrough: true }) reply: FastifyReply
    ) {
      try {
        const cookieHeader = headerString(headers, "cookie");
        await logoutSession({
          sessions: options.sessions,
          presentedRefreshToken: parseCookie(cookieHeader, options.config.sessionCookieName),
          csrfCookie: parseCookie(cookieHeader, CSRF_COOKIE_NAME),
          csrfHeader: headerString(headers, CSRF_HEADER_NAME),
          correlationId: headerString(headers, "x-correlation-id") ?? null
        });
        clearSessionCookies(reply, options.config);
        return { data: {}, meta: {} };
      } catch (error) {
        mapOidcError(error);
      }
    }

    @Post("switch-tenant")
    async switchTenantRoute(
      @Body() body: { tenant_id?: string },
      @Headers() headers: HeaderBag
    ) {
      try {
        const cookieHeader = headerString(headers, "cookie");
        return await switchTenant({
          sessions: options.sessions,
          presentedRefreshToken: parseCookie(cookieHeader, options.config.sessionCookieName),
          csrfCookie: parseCookie(cookieHeader, CSRF_COOKIE_NAME),
          csrfHeader: headerString(headers, CSRF_HEADER_NAME),
          tenantId: body?.tenant_id ?? "",
          correlationId: headerString(headers, "x-correlation-id") ?? null
        });
      } catch (error) {
        mapOidcError(error);
      }
    }
  }

  return RefreshSessionController;
}

export function createSessionDeviceController(
  options: Pick<IdentityHttpOptions, "config" | "sessions">
) {
  @Controller("api/v1")
  class SessionDeviceHttpController {
    @Get("devices")
    async list(@Headers() headers: HeaderBag) {
      try {
        const actorUserId = await requireActorUserId(options, headers);
        return await listDevices({ sessions: options.sessions, actorUserId });
      } catch (error) {
        mapOidcError(error);
      }
    }

    @Delete("sessions/:session_id")
    @HttpCode(204)
    async revokeSessionRoute(
      @Param("session_id") sessionId: string,
      @Headers() headers: HeaderBag
    ) {
      try {
        const actorUserId = await requireActorUserId(options, headers);
        const cookieHeader = headerString(headers, "cookie");
        await revokeSession({
          sessions: options.sessions,
          actorUserId,
          sessionId,
          csrfCookie: parseCookie(cookieHeader, CSRF_COOKIE_NAME),
          csrfHeader: headerString(headers, CSRF_HEADER_NAME),
          correlationId: headerString(headers, "x-correlation-id") ?? null
        });
      } catch (error) {
        mapOidcError(error);
      }
    }

    @Delete("devices/:device_id")
    @HttpCode(204)
    async revokeDeviceRoute(
      @Param("device_id") deviceId: string,
      @Headers() headers: HeaderBag
    ) {
      try {
        const actorUserId = await requireActorUserId(options, headers);
        const cookieHeader = headerString(headers, "cookie");
        await revokeDevice({
          sessions: options.sessions,
          actorUserId,
          deviceId,
          csrfCookie: parseCookie(cookieHeader, CSRF_COOKIE_NAME),
          csrfHeader: headerString(headers, CSRF_HEADER_NAME),
          correlationId: headerString(headers, "x-correlation-id") ?? null
        });
      } catch (error) {
        mapOidcError(error);
      }
    }
  }

  return SessionDeviceHttpController;
}

export function createPasswordResetController(options: { readonly passwordReset: PasswordResetStore }) {
  @Controller("api/v1/auth/password")
  class PasswordResetController {
    @Post("forgot")
    async forgot(@Body() body: { email?: string }) {
      try {
        return await requestPasswordReset({
          store: options.passwordReset,
          email: body?.email ?? ""
        });
      } catch (error) {
        mapOidcError(error);
      }
    }

    @Post("reset")
    async reset(@Body() body: { token?: string; new_password?: string }) {
      try {
        return await resetPassword({
          store: options.passwordReset,
          token: body?.token ?? "",
          newPassword: body?.new_password ?? ""
        });
      } catch (error) {
        mapOidcError(error);
      }
    }
  }

  return PasswordResetController;
}

export function createMfaVerifyController(
  options: Pick<IdentityHttpOptions, "config" | "sessions" | "mfa">
) {
  @Controller("api/v1/auth/mfa")
  class MfaVerifyController {
    @Post("verify")
    async verify(
      @Body() body: { challenge_id?: string; code?: string },
      @Headers() headers: HeaderBag,
      @Res({ passthrough: true }) reply: FastifyReply
    ) {
      try {
        if (!options.mfa) {
          throw new ServiceUnavailableException({
            code: "OIDC_DISABLED",
            message: "MFA is not configured."
          });
        }
        const result = await verifyMfa({
          mfa: options.mfa,
          sessions: options.sessions as import("../../application/mfa-verify.js").MfaSessionRepository,
          config: options.config,
          challengeId: body?.challenge_id ?? "",
          code: body?.code ?? "",
          correlationId: headerString(headers, "x-correlation-id") ?? null
        });

        if (result.refreshTokenPlaintext && result.csrfToken) {
          const maxAge = options.config.refreshTtlDays * 24 * 60 * 60;
          const cookies: string[] = [];
          setCookie(cookies, options.config.sessionCookieName, result.refreshTokenPlaintext, {
            httpOnly: true,
            secure: options.config.sessionCookieSecure,
            maxAgeSeconds: maxAge
          });
          setCookie(cookies, CSRF_COOKIE_NAME, result.csrfToken, {
            httpOnly: false,
            secure: options.config.sessionCookieSecure,
            maxAgeSeconds: maxAge
          });
          reply.header("Set-Cookie", cookies);
        }

        return result.body;
      } catch (error) {
        mapOidcError(error);
      }
    }
  }

  return MfaVerifyController;
}
