import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Body,
  UnprocessableEntityException
} from "@nestjs/common";
import { DomainInvariantError, parseUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import { MissingSecurityContextError } from "@ai-sales/security";
import {
  AnalyticsError,
  createReportExport,
  getAiQualityReportFromFacts,
  getDashboardToday,
  getGrossProfitReport,
  getRevenueReport,
  getSlaReport,
  type AnalyticsRepository
} from "../../application/analytics.js";

type HeaderBag = Record<string, string | string[] | undefined>;

function headerValue(headers: HeaderBag, name: string): string {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new MissingSecurityContextError(name);
  }
  return raw.trim();
}

function optionalHeader(headers: HeaderBag, name: string): string | undefined {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

function parseActor(headers: HeaderBag): {
  actorId: UuidV7;
  tenantId: string;
  permissions: string[];
} {
  try {
    const actorId = parseUuidV7(headerValue(headers, "x-actor-id"));
    const tenantId = headerValue(headers, "x-tenant-id");
    const permissions = (optionalHeader(headers, "x-permissions") ?? "")
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    return { actorId, tenantId, permissions };
  } catch (error) {
    if (error instanceof MissingSecurityContextError || error instanceof DomainInvariantError) {
      throw new ForbiddenException({ code: "AUTH_UNAUTHORIZED", message: "Actor context required." });
    }
    throw error;
  }
}

function mapAnalyticsError(error: unknown): never {
  if (error instanceof AnalyticsError) {
    switch (error.code) {
      case "INSUFFICIENT_PERMISSION":
        throw new ForbiddenException({ code: error.code, message: error.message });
      case "RESOURCE_NOT_FOUND":
        throw new HttpException({ code: error.code, message: error.message }, 404);
      case "IDEMPOTENCY_KEY_REQUIRED":
        throw new BadRequestException({ code: error.code, message: error.message });
      default:
        throw new UnprocessableEntityException({ code: error.code, message: error.message });
    }
  }
  throw error;
}

export function createAnalyticsController(options: { readonly repo: AnalyticsRepository }) {
  @Controller("api/v1")
  class AnalyticsController {
    @Get("dashboard/today")
    async dashboardToday(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await getDashboardToday({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapAnalyticsError(error);
      }
    }

    @Get("reports/revenue")
    async revenueReport(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await getRevenueReport({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapAnalyticsError(error);
      }
    }

    @Get("reports/gross-profit")
    async grossProfitReport(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await getGrossProfitReport({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapAnalyticsError(error);
      }
    }

    @Get("reports/sla")
    async slaReport(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await getSlaReport({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapAnalyticsError(error);
      }
    }

    @Get("reports/ai-quality")
    async aiQualityReport(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await getAiQualityReportFromFacts({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapAnalyticsError(error);
      }
    }

    @Post("report-exports")
    @HttpCode(HttpStatus.ACCEPTED)
    async reportExportRoute(
      @Body()
      body: {
        report_type?: "revenue" | "gross_profit" | "sla" | "ai_quality";
        from?: string | null;
        to?: string | null;
      },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await createReportExport({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key"),
          reportType: body?.report_type ?? "revenue",
          ...(body?.from !== undefined ? { fromAt: body.from } : {}),
          ...(body?.to !== undefined ? { toAt: body.to } : {})
        });
      } catch (error) {
        mapAnalyticsError(error);
      }
    }
  }

  return AnalyticsController;
}
