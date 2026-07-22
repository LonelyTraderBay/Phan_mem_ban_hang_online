export const MODULE_NAME = "tenant" as const;

export {
  provisionTenant,
  normalizeProvisionInput,
  deterministicProvisionTenantId,
  TenantProvisionError,
  SYSTEM_ROLE_IDS,
  ALLOWED_PLAN_IDS,
  PROVISION_IDEMPOTENCY_SCOPE,
  type ProvisionTenantInput,
  type ProvisionTenantResult,
  type TenantProvisionRepository,
  type PlanId
} from "./application/provision-tenant.js";

export { InMemoryTenantProvisionRepository } from "./infrastructure/persistence/in-memory-tenant-provision.repository.js";
export { PostgresTenantProvisionRepository } from "./infrastructure/persistence/postgres-tenant-provision.repository.js";
export { createProvisionTenantController } from "./presentation/http/provision-tenant.controller.js";

export {
  inviteMember,
  listMembers,
  suspendMember,
  activateMember,
  revokeMember,
  resendInvitation,
  MembersRolesError,
  type MembersRolesRepository,
  type MemberResource
} from "./application/members.js";

export {
  listRoles,
  createRole,
  updateRole,
  archiveRole,
  replaceMemberRoles,
  listPermissionsCatalog
} from "./application/roles.js";

export { InMemoryMembersRolesRepository } from "./infrastructure/persistence/in-memory-members-roles.js";
export { PostgresMembersRolesRepository } from "./infrastructure/persistence/postgres-members-roles.js";
export {
  createMembersController,
  createRolesController
} from "./presentation/http/members-roles.controller.js";

export {
  createSupportAccess,
  InMemorySupportGrantStore,
  SupportGrantError,
  type SupportGrantStore
} from "./application/support-grant.js";
export { PostgresSupportGrantStore } from "./infrastructure/persistence/postgres-support-grants.js";
export { createSupportAccessController } from "./presentation/http/support-access.controller.js";
