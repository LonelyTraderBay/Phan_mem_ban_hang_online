import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Body,
  Res,
  UnprocessableEntityException
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { DomainInvariantError, parseUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import { MissingSecurityContextError } from "@ai-sales/security";
import {
  archiveCategory,
  archiveProduct,
  archiveVariant,
  CatalogError,
  createCategory,
  createProduct,
  createVariant,
  getProduct,
  listCategories,
  listProducts,
  listVariants,
  updateCategory,
  updateProduct,
  updateVariant,
  type CatalogRepository
} from "../../application/catalog.js";

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

/** If-Match example per contract: '"v3"' — quoted `v{version}`. */
function parseIfMatchVersion(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^"?v(\d+)"?$/.exec(value.trim());
  return match?.[1] ? Number(match[1]) : null;
}

/**
 * PATCH ops require If-Match matching version OR body expected_version (ticket-scoped
 * relaxation of the frozen contract, which lists both IfMatch and expected_version as
 * required — see docs/tickets/BE-CAT-002.md completion notes).
 */
function resolveExpectedVersion(headers: HeaderBag, bodyExpectedVersion: number | undefined): number {
  const fromHeader = parseIfMatchVersion(optionalHeader(headers, "if-match"));
  if (fromHeader !== null) return fromHeader;
  if (typeof bodyExpectedVersion === "number") return bodyExpectedVersion;
  throw new UnprocessableEntityException({
    code: "VALIDATION_FAILED",
    message: "expected_version or If-Match header is required."
  });
}

function mapCatalogError(error: unknown): never {
  if (error instanceof CatalogError) {
    switch (error.code) {
      case "INSUFFICIENT_PERMISSION":
      case "COST_PERMISSION_REQUIRED":
        throw new ForbiddenException({ code: error.code, message: error.message });
      case "RESOURCE_NOT_FOUND":
        throw new HttpException({ code: error.code, message: error.message }, 404);
      case "RESOURCE_VERSION_MISMATCH":
        throw new HttpException({ code: error.code, message: error.message }, 412);
      case "SKU_DUPLICATE":
      case "BARCODE_DUPLICATE":
      case "PRODUCT_ARCHIVED":
        throw new ConflictException({ code: error.code, message: error.message });
      case "IDEMPOTENCY_KEY_REQUIRED":
        throw new BadRequestException({ code: error.code, message: error.message });
      case "CATEGORY_CYCLE":
      case "VALIDATION_FAILED":
      default:
        throw new UnprocessableEntityException({ code: error.code, message: error.message });
    }
  }
  throw error;
}

export function createCatalogController(options: { readonly repo: CatalogRepository }) {
  @Controller("api/v1")
  class CatalogController {
    // -------------------------------------------------------------------
    // Categories
    // -------------------------------------------------------------------

    @Get("categories")
    async listCategories(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await listCategories({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapCatalogError(error);
      }
    }

    @Post("categories")
    @HttpCode(HttpStatus.CREATED)
    async createCategory(
      @Body() body: { name?: string; parent_id?: string | null },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await createCategory({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key") ?? null,
          name: body?.name ?? "",
          parentId: body?.parent_id ?? null
        });
      } catch (error) {
        mapCatalogError(error);
      }
    }

    @Patch("categories/:category_id")
    async updateCategory(
      @Param("category_id") categoryId: string,
      @Body() body: { expected_version?: number; name?: string | null; parent_id?: string | null },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await updateCategory({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          categoryId,
          expectedVersion: resolveExpectedVersion(headers, body?.expected_version),
          name: body?.name ?? null,
          ...(body?.parent_id !== undefined ? { parentId: body.parent_id } : {})
        });
      } catch (error) {
        mapCatalogError(error);
      }
    }

    @Post("categories/:category_id/archive")
    async archiveCategory(@Param("category_id") categoryId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await archiveCategory({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key") ?? null,
          categoryId,
          expectedVersion: parseIfMatchVersion(optionalHeader(headers, "if-match"))
        });
      } catch (error) {
        mapCatalogError(error);
      }
    }

    // -------------------------------------------------------------------
    // Products
    // -------------------------------------------------------------------

    @Get("products")
    async listProducts(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await listProducts({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapCatalogError(error);
      }
    }

    @Post("products")
    @HttpCode(HttpStatus.CREATED)
    async createProduct(
      @Body()
      body: {
        name?: string;
        description?: string | null;
        category_id?: string | null;
        brand?: string | null;
        status?: "draft" | "active";
      },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await createProduct({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key") ?? null,
          name: body?.name ?? "",
          description: body?.description ?? null,
          categoryId: body?.category_id ?? null,
          brand: body?.brand ?? null,
          status: body?.status ?? null
        });
      } catch (error) {
        mapCatalogError(error);
      }
    }

    @Get("products/:product_id")
    async getProductById(
      @Param("product_id") productId: string,
      @Headers() headers: HeaderBag,
      @Res({ passthrough: true }) reply: FastifyReply
    ) {
      try {
        const actor = parseActor(headers);
        const result = await getProduct({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          productId
        });
        reply.header("ETag", `"v${result.data.version}"`);
        return result;
      } catch (error) {
        mapCatalogError(error);
      }
    }

    @Patch("products/:product_id")
    async updateProduct(
      @Param("product_id") productId: string,
      @Body()
      body: {
        expected_version?: number;
        name?: string | null;
        description?: string | null;
        category_id?: string | null;
        brand?: string | null;
        status?: "draft" | "active" | null;
      },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await updateProduct({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          productId,
          expectedVersion: resolveExpectedVersion(headers, body?.expected_version),
          name: body?.name ?? null,
          status: body?.status ?? null,
          ...(body?.description !== undefined ? { description: body.description } : {}),
          ...(body?.category_id !== undefined ? { categoryId: body.category_id } : {}),
          ...(body?.brand !== undefined ? { brand: body.brand } : {})
        });
      } catch (error) {
        mapCatalogError(error);
      }
    }

    @Post("products/:product_id/archive")
    async archiveProduct(@Param("product_id") productId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await archiveProduct({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key") ?? null,
          productId,
          expectedVersion: parseIfMatchVersion(optionalHeader(headers, "if-match"))
        });
      } catch (error) {
        mapCatalogError(error);
      }
    }

    // -------------------------------------------------------------------
    // Variants
    // -------------------------------------------------------------------

    @Get("variants")
    async listVariants(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await listVariants({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapCatalogError(error);
      }
    }

    @Post("products/:product_id/variants")
    @HttpCode(HttpStatus.CREATED)
    async createVariant(
      @Param("product_id") productId: string,
      @Body()
      body: {
        sku?: string;
        unit_price_minor?: number;
        currency?: string;
      },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await createVariant({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          actorId: actor.actorId,
          idempotencyKey: optionalHeader(headers, "idempotency-key") ?? null,
          productId,
          sku: body?.sku ?? "",
          unitPriceMinor: body?.unit_price_minor ?? null,
          currency: body?.currency ?? null
        });
      } catch (error) {
        mapCatalogError(error);
      }
    }

    @Patch("variants/:variant_id")
    async updateVariant(
      @Param("variant_id") variantId: string,
      @Body()
      body: {
        expected_version?: number;
        unit_price_minor?: number | null;
        status?: "active" | "archived" | null;
      },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await updateVariant({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          actorId: actor.actorId,
          variantId,
          expectedVersion: resolveExpectedVersion(headers, body?.expected_version),
          unitPriceMinor: body?.unit_price_minor ?? null,
          status: body?.status ?? null
        });
      } catch (error) {
        mapCatalogError(error);
      }
    }

    @Post("variants/:variant_id/archive")
    async archiveVariant(@Param("variant_id") variantId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await archiveVariant({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          idempotencyKey: optionalHeader(headers, "idempotency-key") ?? null,
          variantId,
          expectedVersion: parseIfMatchVersion(optionalHeader(headers, "if-match"))
        });
      } catch (error) {
        mapCatalogError(error);
      }
    }
  }

  return CatalogController;
}
