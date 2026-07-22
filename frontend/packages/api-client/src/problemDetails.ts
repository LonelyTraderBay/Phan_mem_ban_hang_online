import type { ErrorCode } from "./generated/errorCodes";

export interface FieldError {
  path: string;
  code: string;
  message: string;
}

/**
 * RFC 9457 `application/problem+json` shape with the project's extensions (spec 11.3/11.4).
 * Frontend maps errors by `code`, never by `detail` text (spec 11.3: "map theo code, không map
 * bằng detail text").
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: ErrorCode;
  detail?: string;
  instance?: string;
  request_id?: string;
  trace_id?: string;
  retryable?: boolean;
  field_errors?: FieldError[];
  meta?: Record<string, unknown>;
}

export function isProblemDetails(value: unknown): value is ProblemDetails {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.type === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.status === "number" &&
    typeof candidate.code === "string"
  );
}

/** Returns null (rather than throwing) when the response is not a Problem Details payload. */
export async function parseProblemDetails(response: Response): Promise<ProblemDetails | null> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/problem+json")) return null;
  try {
    const json: unknown = await response.json();
    return isProblemDetails(json) ? json : null;
  } catch {
    return null;
  }
}

/** Maps `field_errors[].path` for React Hook Form (spec 11.4). Unmapped errors are the caller's
 * responsibility to surface as a form-level error. */
export function fieldErrorsByPath(problem: ProblemDetails): Record<string, FieldError> {
  const result: Record<string, FieldError> = {};
  for (const fieldError of problem.field_errors ?? []) {
    result[fieldError.path] = fieldError;
  }
  return result;
}
