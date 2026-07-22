import {
  HttpException,
  HttpStatus
} from "@nestjs/common";
import { AuthorizationError, MissingSecurityContextError } from "@ai-sales/security";
import {
  IdempotencyInProgressError,
  IdempotencyKeyReusedError
} from "@ai-sales/idempotency";

export interface ProblemDetails {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance?: string;
  readonly code: string;
  readonly correlationId?: string;
}

function problemType(code: string): string {
  return `https://ai-sales.local/problems/${code}`;
}

export function toProblemDetails(
  exception: unknown,
  opts: { readonly instance?: string; readonly correlationId?: string } = {}
): ProblemDetails {
  const base = {
    ...(opts.instance !== undefined ? { instance: opts.instance } : {}),
    ...(opts.correlationId !== undefined ? { correlationId: opts.correlationId } : {})
  };

  if (exception instanceof AuthorizationError) {
    return {
      type: problemType("PERMISSION_DENIED"),
      title: "Forbidden",
      status: HttpStatus.FORBIDDEN,
      detail: exception.message,
      code: "PERMISSION_DENIED",
      ...base
    };
  }
  if (exception instanceof MissingSecurityContextError) {
    return {
      type: problemType("SECURITY_CONTEXT_MISSING"),
      title: "Forbidden",
      status: HttpStatus.FORBIDDEN,
      detail: exception.message,
      code: "SECURITY_CONTEXT_MISSING",
      ...base
    };
  }
  if (exception instanceof IdempotencyKeyReusedError) {
    return {
      type: problemType(exception.code),
      title: "Conflict",
      status: HttpStatus.CONFLICT,
      detail: exception.message,
      code: exception.code,
      ...base
    };
  }
  if (exception instanceof IdempotencyInProgressError) {
    return {
      type: problemType(exception.code),
      title: "Conflict",
      status: HttpStatus.CONFLICT,
      detail: exception.message,
      code: exception.code,
      ...base
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    const detail =
      typeof response === "string"
        ? response
        : typeof response === "object" && response !== null && "message" in response
          ? Array.isArray((response as { message: unknown }).message)
            ? ((response as { message: string[] }).message).join(", ")
            : String((response as { message: unknown }).message)
          : exception.message;
    const code =
      typeof response === "object" && response !== null && "error" in response
        ? String((response as { error: unknown }).error)
            .toUpperCase()
            .replace(/\s+/g, "_")
        : `HTTP_${status}`;
    return {
      type: problemType(code),
      title: HttpStatus[status] ?? "Error",
      status,
      detail,
      code,
      ...base
    };
  }
  return {
    type: problemType("INTERNAL_ERROR"),
    title: "Internal Server Error",
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    detail: "An unexpected error occurred.",
    code: "INTERNAL_ERROR",
    ...base
  };
}
