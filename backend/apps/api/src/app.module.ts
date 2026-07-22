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
  createKnowledgeController,
  InMemoryKnowledgeRepository
} from "@ai-sales/module-knowledge";
import {
  createChannelController,
  InMemoryChannelRepository,
  queueOutboundMessage,
  stubFacebookAdapter
} from "@ai-sales/module-channel";
import {
  createConversationController,
  InMemoryConversationRepository,
  type OutboundQueuePort
} from "@ai-sales/module-conversation";
import {
  createFulfillmentController,
  InMemoryFulfillmentRepository,
  type InventoryRestockPort,
  type OrderEligibilityPort
} from "@ai-sales/module-fulfillment";
import {
  convertInventoryReservation,
  createInventoryReservation,
  releaseInventoryReservation
} from "@ai-sales/module-inventory";
import {
  createOrderController,
  InMemoryOrderRepository,
  type CatalogPricingPort,
  type ReservationPort
} from "@ai-sales/module-order";
import {
  createPaymentController,
  InMemoryPaymentRepository,
  type OrderLookupPort
} from "@ai-sales/module-payment";
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
const knowledgeRepo = new InMemoryKnowledgeRepository();
const channelRepo = new InMemoryChannelRepository();
const conversationRepo = new InMemoryConversationRepository();
const orderRepo = new InMemoryOrderRepository();
const paymentRepo = new InMemoryPaymentRepository();
const fulfillmentRepo = new InMemoryFulfillmentRepository();

const catalogPricingPort: CatalogPricingPort = {
  async getVariantPricing(args) {
    const row = await catalogRepo.getVariantPricing(args);
    if (!row) return null;
    const variant = (await catalogRepo.listVariants(args.tenantId)).find((v) => v.id === args.variantId);
    return {
      unitPriceMinor: row.unit_price_minor,
      currency: row.currency,
      costMinor: row.cost_minor,
      sku: variant?.name ?? null
    };
  }
};

const reservationPort: ReservationPort = {
  async createReservation(args) {
    const expiresAt = args.expiresAt;
    const result = await createInventoryReservation({
      repo: inventoryRepo,
      tenantId: args.tenantId,
      actorId: args.actorId,
      actorPermissions: ["inventory.reserve", "internal.order.confirm"],
      idempotencyKey: args.idempotencyKey,
      ownerType: "order",
      ownerId: args.orderId,
      expiresAt,
      items: args.items.map((i) => ({ variant_id: i.variantId, quantity: i.quantity }))
    });
    return { reservationId: result.data.id as string };
  },
  async convertReservation(args) {
    await convertInventoryReservation({
      repo: inventoryRepo,
      tenantId: args.tenantId,
      reservationId: args.reservationId,
      ownerId: args.orderId,
      actorId: args.actorId,
      actorPermissions: ["inventory.reserve", "internal.order.confirm"],
      idempotencyKey: args.idempotencyKey
    });
  },
  async releaseReservation(args) {
    await releaseInventoryReservation({
      repo: inventoryRepo,
      tenantId: args.tenantId,
      reservationId: args.reservationId,
      actorId: args.actorId,
      actorPermissions: ["inventory.reserve"],
      idempotencyKey: args.idempotencyKey
    });
  }
};

const orderLookupPort: OrderLookupPort = {
  async getOrderGrandTotal(args) {
    const order = await orderRepo.getOrder({
      tenantId: args.tenantId,
      orderId: args.orderId
    });
    if (!order) return null;
    return { grandTotalMinor: order.grandTotalMinor, currency: order.currency };
  }
};

const orderEligibilityPort: OrderEligibilityPort = {
  async isOrderConfirmed(args) {
    const order = await orderRepo.getOrder({
      tenantId: args.tenantId,
      orderId: args.orderId
    });
    return order?.status === "confirmed";
  },
  async getOrderItemIds(args) {
    const order = await orderRepo.getOrder({
      tenantId: args.tenantId,
      orderId: args.orderId
    });
    return order?.items.map((i) => i.id) ?? [];
  }
};

const inventoryRestockPort: InventoryRestockPort = {
  async restockStub() {
    /* BE-RET-001 stub — inventory adjustment wiring follows Postgres adapter */
  }
};

const conversationOutboundPort: OutboundQueuePort = {
  async queueReply(args) {
    const queued = await queueOutboundMessage({
      repo: channelRepo,
      tenantId: args.tenantId,
      actorId: args.actorId,
      channelAccountId: args.channelAccountId,
      idempotencyKey: args.idempotencyKey,
      contentType: "text",
      text: args.text
    });
    return { outboundMessageId: queued.id, status: "queued" };
  }
};

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
      createInventoryController({ repo: inventoryRepo }),
      createKnowledgeController({ repo: knowledgeRepo }),
      createChannelController({ repo: channelRepo, adapter: stubFacebookAdapter }),
      createConversationController({ repo: conversationRepo, outbound: conversationOutboundPort }),
      createOrderController({
        repo: orderRepo,
        catalog: catalogPricingPort,
        reservation: reservationPort
      }),
      createPaymentController({ repo: paymentRepo, orders: orderLookupPort }),
      createFulfillmentController({
        repo: fulfillmentRepo,
        orders: orderEligibilityPort,
        inventory: inventoryRestockPort
      })
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
