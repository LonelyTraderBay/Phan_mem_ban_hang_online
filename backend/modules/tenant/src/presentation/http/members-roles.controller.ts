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
  Put,
  Body,
  Delete
} from "@nestjs/common";
import { DomainInvariantError, parseUuidV7, type UuidV7 } from "@ai-sales/domain-kernel";
import { MissingSecurityContextError } from "@ai-sales/security";
import {
  activateMember,
  inviteMember,
  listMembers,
  MembersRolesError,
  resendInvitation,
  revokeMember,
  suspendMember,
  type MembersRolesRepository
} from "../../application/members.js";
import {
  archiveRole,
  createRole,
  listPermissionsCatalog,
  listRoles,
  replaceMemberRoles,
  updateRole
} from "../../application/roles.js";

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

function mapMembersError(error: unknown): never {
  if (error instanceof MembersRolesError) {
    if (error.code === "INSUFFICIENT_PERMISSION") {
      throw new ForbiddenException({ code: error.code, message: error.message });
    }
    if (error.code === "RESOURCE_NOT_FOUND") {
      throw new HttpException({ code: error.code, message: error.message }, 404);
    }
    if (error.code === "RESOURCE_VERSION_MISMATCH") {
      throw new HttpException({ code: error.code, message: error.message }, 412);
    }
    if (
      error.code === "CONFLICT" ||
      error.code === "USER_LAST_OWNER" ||
      error.code === "ROLE_WOULD_REMOVE_LAST_ADMIN" ||
      error.code === "INVITE_EXPIRED" ||
      error.code === "INVITE_REVOKED" ||
      error.code === "INVITE_ALREADY_ACCEPTED" ||
      error.code === "INVITATION_TOKEN_INVALID"
    ) {
      throw new ConflictException({ code: error.code, message: error.message });
    }
    throw new BadRequestException({ code: error.code, message: error.message });
  }
  throw error;
}

export function createMembersController(options: { readonly repo: MembersRolesRepository }) {
  @Controller("api/v1/members")
  class MembersController {
    @Get()
    async list(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await listMembers({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapMembersError(error);
      }
    }

    @Post("invitations")
    @HttpCode(HttpStatus.CREATED)
    async invite(
      @Body() body: { email?: string; display_name?: string | null; role_ids?: string[] },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        if (!optionalHeader(headers, "idempotency-key")) {
          throw new BadRequestException("Idempotency-Key header is required.");
        }
        const result = await inviteMember({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorUserId: actor.actorId,
          actorPermissions: actor.permissions,
          email: body?.email ?? "",
          displayName: body?.display_name ?? null,
          roleIds: body?.role_ids ?? null
        });
        // Token delivery via email/outbox later; not returned in public response.
        return result.body;
      } catch (error) {
        mapMembersError(error);
      }
    }

    @Post("invitations/:invitation_id/resend")
    async resend(@Param("invitation_id") invitationId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        const result = await resendInvitation({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          invitationId
        });
        return result.body;
      } catch (error) {
        mapMembersError(error);
      }
    }

    @Post(":member_id/suspend")
    async suspend(@Param("member_id") memberId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await suspendMember({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          memberId
        });
      } catch (error) {
        mapMembersError(error);
      }
    }

    @Post(":member_id/activate")
    async activate(@Param("member_id") memberId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await activateMember({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          memberId
        });
      } catch (error) {
        mapMembersError(error);
      }
    }

    @Post(":member_id/revoke")
    async revoke(@Param("member_id") memberId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await revokeMember({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          memberId
        });
      } catch (error) {
        mapMembersError(error);
      }
    }

    @Put(":member_id/roles")
    async replaceRoles(
      @Param("member_id") memberId: string,
      @Body() body: { role_ids?: string[]; expected_version?: number },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await replaceMemberRoles({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          memberId,
          roleIds: body?.role_ids ?? [],
          expectedVersion: body?.expected_version ?? 0
        });
      } catch (error) {
        mapMembersError(error);
      }
    }
  }

  return MembersController;
}

export function createRolesController(options: { readonly repo: MembersRolesRepository }) {
  @Controller("api/v1")
  class RolesController {
    @Get("roles")
    async list(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await listRoles({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapMembersError(error);
      }
    }

    @Post("roles")
    @HttpCode(HttpStatus.CREATED)
    async create(
      @Body() body: { name?: string; description?: string | null; permissions?: string[] },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await createRole({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          name: body?.name ?? "",
          description: body?.description ?? null,
          permissions: body?.permissions ?? []
        });
      } catch (error) {
        mapMembersError(error);
      }
    }

    @Patch("roles/:role_id")
    async update(
      @Param("role_id") roleId: string,
      @Body()
      body: {
        expected_version?: number;
        name?: string | null;
        description?: string | null;
        permissions?: string[] | null;
      },
      @Headers() headers: HeaderBag
    ) {
      try {
        const actor = parseActor(headers);
        return await updateRole({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          roleId,
          expectedVersion: body?.expected_version ?? 0,
          ...(body?.name !== undefined ? { name: body.name } : {}),
          ...(body?.description !== undefined ? { description: body.description } : {}),
          ...(body?.permissions !== undefined ? { permissions: body.permissions } : {})
        });
      } catch (error) {
        mapMembersError(error);
      }
    }

    @Delete("roles/:role_id")
    @HttpCode(204)
    async archive(@Param("role_id") roleId: string, @Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        await archiveRole({
          repo: options.repo,
          tenantId: actor.tenantId,
          actorPermissions: actor.permissions,
          roleId
        });
      } catch (error) {
        mapMembersError(error);
      }
    }

    @Get("permissions")
    async permissions(@Headers() headers: HeaderBag) {
      try {
        const actor = parseActor(headers);
        return await listPermissionsCatalog({
          repo: options.repo,
          actorPermissions: actor.permissions
        });
      } catch (error) {
        mapMembersError(error);
      }
    }
  }

  return RolesController;
}
