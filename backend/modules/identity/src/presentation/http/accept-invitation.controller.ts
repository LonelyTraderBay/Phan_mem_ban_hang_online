import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpException,
  Post,
  Res
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import {
  acceptInvitation,
  AcceptInvitationError,
  type InvitationAcceptStore
} from "../../application/accept-invitation.js";
import {
  CSRF_COOKIE_NAME,
  type OidcClientConfig
} from "../../application/oidc-types.js";

function setCookie(
  cookies: string[],
  name: string,
  value: string,
  options: { httpOnly: boolean; secure: boolean; maxAgeSeconds: number }
): void {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${options.maxAgeSeconds}`,
    "SameSite=Lax"
  ];
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  cookies.push(parts.join("; "));
}

export function createAcceptInvitationController(options: {
  readonly store: InvitationAcceptStore;
  readonly config?: Pick<
    OidcClientConfig,
    "sessionCookieName" | "sessionCookieSecure" | "refreshTtlDays" | "sessionAbsoluteTtlHours"
  >;
}) {
  @Controller("api/v1/invitations")
  class AcceptInvitationController {
    @Post("accept")
    async accept(
      @Body() body: { token?: string; password?: string | null },
      @Res({ passthrough: true }) reply: FastifyReply
    ) {
      try {
        const result = await acceptInvitation({
          store: options.store,
          token: body?.token ?? "",
          password: body?.password ?? null,
          ...(options.config ? { config: options.config } : {})
        });

        if (result.refreshTokenPlaintext && result.csrfToken && options.config) {
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
        if (error instanceof AcceptInvitationError) {
          if (error.code === "VALIDATION_FAILED") {
            throw new BadRequestException({ code: error.code, message: error.message });
          }
          throw new ConflictException({ code: error.code, message: error.message });
        }
        throw error instanceof HttpException ? error : error;
      }
    }
  }

  return AcceptInvitationController;
}
