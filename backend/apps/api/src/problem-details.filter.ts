import { Catch, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import { toProblemDetails } from "./problem-details";

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{
      status: (code: number) => { header: (k: string, v: string) => { send: (body: unknown) => void } };
      code?: (code: number) => { type: (t: string) => { send: (body: unknown) => void } };
    }>();
    const request = ctx.getRequest<{ url?: string; headers?: Record<string, string | string[] | undefined> }>();
    const correlationHeader = request.headers?.["x-correlation-id"];
    const correlationId = typeof correlationHeader === "string" ? correlationHeader : undefined;
    const problem = toProblemDetails(exception, {
      ...(request.url !== undefined ? { instance: request.url } : {}),
      ...(correlationId !== undefined ? { correlationId } : {})
    });

    if (typeof response.code === "function") {
      response.code(problem.status).type("application/problem+json").send(problem);
      return;
    }
    response.status(problem.status).header("content-type", "application/problem+json").send(problem);
  }
}
