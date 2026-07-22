import { Module, type DynamicModule, type Type } from "@nestjs/common";
import { isOidcConfigured, loadConfig } from "@ai-sales/config";
import { createDatabase } from "@ai-sales/database";
import { PostgresIdempotencyStore } from "@ai-sales/idempotency";
import {
  createAuditExportsController,
  createAuditLogsController,
  createWalkingSkeletonController,
  InMemoryAuditLogStore,
  PostgresAuditWriter,
  PostgresOutboxWriter,
  PostgresWalkingSkeletonTracer
} from "@ai-sales/module-audit";
import {
  createCatalogController,
  createInMemoryImportApplyPort,
  InMemoryCatalogRepository,
  InMemoryImportRepository
} from "@ai-sales/module-catalog";
import {
  createCustomersController,
  InMemoryCustomerRepository
} from "@ai-sales/module-customer";
import {
  createInventoryController,
  InMemoryInventoryRepository
} from "@ai-sales/module-inventory";
import {
  createAcceptInvitationController,
  createMeController,
  createMfaVerifyController,
  createOidcAuthController,
  createPasswordResetController,
  createRefreshSessionController,
  createSessionDeviceController,
  HttpOidcTokenClient,
  PostgresMfaStore,
  PostgresOidcStateStore,
  PostgresPasswordResetStore,
  PostgresSessionAuthRepository,
  providerNameFromIssuer,
  type OidcClientConfig
} from "@ai-sales/module-identity";
import {
  createMembersController,
  createProvisionTenantController,
  createRolesController,
  createSupportAccessController,
  InMemoryMembersRolesRepository,
  InMemorySupportGrantStore,
  PostgresTenantProvisionRepository
} from "@ai-sales/module-tenant";
import { HealthController } from "./health.controller";

/** Process-local stores until Postgres SECURITY DEFINER adapters land. */
const membersRolesRepo = new InMemoryMembersRolesRepository();
const auditLogStore = new InMemoryAuditLogStore();
const supportGrantStore = new InMemorySupportGrantStore();
const catalogRepo = new InMemoryCatalogRepository();
const importRepo = new InMemoryImportRepository();
const importApplyPort = createInMemoryImportApplyPort(catalogRepo);
const customerRepo = new InMemoryCustomerRepository();
const inventoryRepo = new InMemoryInventoryRepository();

function buildOidcConfig(): OidcClientConfig | null {
  const config = loadConfig(process.env);
  if (!isOidcConfigured(config)) return null;
  const authorizationEndpoint =
    config.OIDC_AUTHORIZATION_ENDPOINT ??
    `${config.OIDC_ISSUER!.replace(/\/$/, "")}/authorize`;
  const tokenEndpoint =
    config.OIDC_TOKEN_ENDPOINT ?? `${config.OIDC_ISSUER!.replace(/\/$/, "")}/token`;
  return {
    enabled: true,
    issuer: config.OIDC_ISSUER!,
    clientId: config.OIDC_CLIENT_ID!,
    clientSecret: config.OIDC_CLIENT_SECRET!,
    redirectUri: config.OIDC_REDIRECT_URI!,
    scopes: config.OIDC_SCOPES,
    authorizationEndpoint,
    tokenEndpoint,
    providerName: providerNameFromIssuer(config.OIDC_ISSUER!),
    sessionCookieName: config.SESSION_COOKIE_NAME,
    sessionCookieSecure: config.SESSION_COOKIE_SECURE,
    sessionAbsoluteTtlHours: config.SESSION_ABSOLUTE_TTL_HOURS,
    refreshTtlDays: config.REFRESH_TTL_DAYS
  };
}

function buildControllers(): Type<unknown>[] {
  const config = loadConfig(process.env);
  const controllers: Type<unknown>[] = [HealthController];

  if (config.DATABASE_URL) {
    const db = createDatabase(config.DATABASE_URL);
    const idempotency = new PostgresIdempotencyStore(db);
    const tenantRepo = new PostgresTenantProvisionRepository(db);
    controllers.push(
      createProvisionTenantController({
        repo: tenantRepo,
        idempotency
      }),
      createMembersController({ repo: membersRolesRepo }),
      createRolesController({ repo: membersRolesRepo }),
      createAcceptInvitationController({ store: membersRolesRepo }),
      createAuditLogsController({ store: auditLogStore }),
      createAuditExportsController({ store: auditLogStore }),
      createSupportAccessController({ store: supportGrantStore }),
      createCatalogController({
        repo: catalogRepo,
        importRepo,
        importApplyPort
      }),
      createCustomersController({ repo: customerRepo }),
      createInventoryController({ repo: inventoryRepo })
    );

    const oidc = buildOidcConfig();
    if (oidc) {
      const stateStore = new PostgresOidcStateStore(db);
      const sessions = new PostgresSessionAuthRepository(db);
      const tokenClient = new HttpOidcTokenClient(oidc);
      const mfa = new PostgresMfaStore(db);
      const passwordReset = new PostgresPasswordResetStore(db);
      controllers.push(
        createOidcAuthController({ config: oidc, stateStore, tokenClient, sessions, mfa }),
        createMeController({ config: oidc, sessions }),
        createRefreshSessionController({ config: oidc, sessions }),
        createSessionDeviceController({ config: oidc, sessions }),
        createMfaVerifyController({ config: oidc, sessions, mfa }),
        createPasswordResetController({ passwordReset })
      );
    }

    if (config.WALKING_SKELETON_ENABLED) {
      const auditWriter = new PostgresAuditWriter(db);
      const outboxWriter = new PostgresOutboxWriter(db);
      const tracer = new PostgresWalkingSkeletonTracer(db, auditWriter, outboxWriter);
      controllers.push(createWalkingSkeletonController({ enabled: true, tracer }));
    }
  }

  return controllers;
}

@Module({})
export class AppModule {
  static register(): DynamicModule {
    return {
      module: AppModule,
      controllers: buildControllers()
    };
  }
}
