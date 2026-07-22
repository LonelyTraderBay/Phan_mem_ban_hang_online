import { Module, type DynamicModule, type Type } from "@nestjs/common";
import { isOidcConfigured, loadConfig } from "@ai-sales/config";
import { createDatabase } from "@ai-sales/database";
import { PostgresIdempotencyStore } from "@ai-sales/idempotency";
import {
  createAuditExportsController,
  createAuditLogsController,
  createWalkingSkeletonController,
  PostgresAuditLogStore,
  PostgresAuditWriter,
  PostgresOutboxWriter,
  PostgresWalkingSkeletonTracer
} from "@ai-sales/module-audit";
import {
  createCatalogController,
  createInMemoryImportApplyPort,
  PostgresCatalogRepository,
  PostgresImportRepository
} from "@ai-sales/module-catalog";
import {
  createCustomersController,
  PostgresCustomerRepository
} from "@ai-sales/module-customer";
import {
  convertInventoryReservation,
  createInventoryController,
  createInventoryReservation,
  PostgresInventoryRepository,
  releaseInventoryReservation,
  type InventoryRepository
} from "@ai-sales/module-inventory";
import type { CatalogRepository } from "@ai-sales/module-catalog";
import {
  createKnowledgeController,
  PostgresKnowledgeRepository,
  searchPublishedKnowledge
} from "@ai-sales/module-knowledge";
import {
  createChannelController,
  PostgresChannelRepository,
  queueOutboundMessage,
  stubFacebookAdapter,
  type ChannelRepository
} from "@ai-sales/module-channel";
import {
  createConversationController,
  PostgresConversationRepository,
  type ConversationRepository,
  type OutboundQueuePort
} from "@ai-sales/module-conversation";
import {
  createAiOrchestrationController,
  createKnowledgeRetrievalClient,
  PostgresAiOrchestrationRepository,
  type ConversationLookupPort,
  type OutboundSendPort
} from "@ai-sales/module-ai-orchestration";
import {
  createAnalyticsController,
  PostgresAnalyticsRepository
} from "@ai-sales/module-analytics";
import {
  createBillingController,
  PostgresBillingRepository
} from "@ai-sales/module-billing";
import {
  createOperationsController,
  PostgresOperationsRepository
} from "@ai-sales/module-operations";
import {
  createFulfillmentController,
  PostgresFulfillmentRepository,
  type InventoryRestockPort,
  type OrderEligibilityPort
} from "@ai-sales/module-fulfillment";
import {
  createOrderController,
  PostgresOrderRepository,
  type CatalogPricingPort,
  type OrderRepository,
  type ReservationPort
} from "@ai-sales/module-order";
import {
  createPaymentController,
  PostgresPaymentRepository,
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
  PostgresMembersRolesRepository,
  PostgresSupportGrantStore,
  PostgresTenantProvisionRepository
} from "@ai-sales/module-tenant";
import { HealthController } from "./health.controller";

function buildConversationOutboundPort(channelRepo: ChannelRepository): OutboundQueuePort {
  return {
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
}

function buildConversationLookupPort(
  conversationRepo: ConversationRepository
): ConversationLookupPort {
  return {
    async conversationExists(args) {
      const conv = await conversationRepo.getConversation({
        tenantId: args.tenantId,
        conversationId: args.conversationId
      });
      return conv !== null;
    }
  };
}

function buildAiOutboundPort(
  conversationRepo: ConversationRepository,
  channelRepo: ChannelRepository
): OutboundSendPort {
  return {
    async queueSuggestionSend(args) {
      const conv = await conversationRepo.getConversation({
        tenantId: args.tenantId,
        conversationId: args.conversationId
      });
      if (!conv?.channelAccountId) {
        // Fail closed: never report success when nothing was enqueued.
        throw new Error("Conversation has no channel account for outbound send.");
      }
      const queued = await queueOutboundMessage({
        repo: channelRepo,
        tenantId: args.tenantId,
        actorId: args.actorId,
        channelAccountId: conv.channelAccountId,
        idempotencyKey: args.idempotencyKey,
        contentType: "text",
        text: args.text
      });
      return { jobId: queued.id, status: "queued" };
    }
  };
}

function buildCatalogPricingPort(catalogRepo: CatalogRepository): CatalogPricingPort {
  return {
    async getVariantPricing(args) {
      const row = await catalogRepo.getVariantPricing(args);
      if (!row) return null;
      const variant = (await catalogRepo.listVariants(args.tenantId)).find(
        (v) => v.id === args.variantId
      );
      return {
        unitPriceMinor: row.unit_price_minor,
        currency: row.currency,
        costMinor: row.cost_minor,
        sku: variant?.name ?? null
      };
    }
  };
}

function buildReservationPort(inventoryRepo: InventoryRepository): ReservationPort {
  return {
    async createReservation(args) {
      const result = await createInventoryReservation({
        repo: inventoryRepo,
        tenantId: args.tenantId,
        actorId: args.actorId,
        actorPermissions: ["inventory.reserve", "internal.order.confirm"],
        idempotencyKey: args.idempotencyKey,
        ownerType: "order",
        ownerId: args.orderId,
        expiresAt: args.expiresAt,
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
}

function buildOrderLookupPort(repo: OrderRepository): OrderLookupPort {
  return {
    async getOrderGrandTotal(args) {
      const order = await repo.getOrder({
        tenantId: args.tenantId,
        orderId: args.orderId
      });
      if (!order) return null;
      return { grandTotalMinor: order.grandTotalMinor, currency: order.currency };
    }
  };
}

function buildOrderEligibilityPort(repo: OrderRepository): OrderEligibilityPort {
  return {
    async isOrderConfirmed(args) {
      const order = await repo.getOrder({
        tenantId: args.tenantId,
        orderId: args.orderId
      });
      return order?.status === "confirmed";
    },
    async getOrderItemIds(args) {
      const order = await repo.getOrder({
        tenantId: args.tenantId,
        orderId: args.orderId
      });
      return order?.items.map((i) => i.id) ?? [];
    }
  };
}

const inventoryRestockPort: InventoryRestockPort = {
  async restockStub() {
    /* BE-RET-001 stub — inventory adjustment wiring follows Postgres adapter */
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
    const catalogRepo = new PostgresCatalogRepository(db);
    const customerRepo = new PostgresCustomerRepository(db);
    const inventoryRepo = new PostgresInventoryRepository(db);
    const importRepoPg = new PostgresImportRepository(db);
    const orderRepoPg = new PostgresOrderRepository(db);
    const paymentRepoPg = new PostgresPaymentRepository(db);
    const fulfillmentRepoPg = new PostgresFulfillmentRepository(db);
    const channelRepoPg = new PostgresChannelRepository(db);
    const conversationRepoPg = new PostgresConversationRepository(db);
    const knowledgeRepoPg = new PostgresKnowledgeRepository(db);
    const aiOrchestrationRepoPg = new PostgresAiOrchestrationRepository(db);
    const analyticsRepoPg = new PostgresAnalyticsRepository(db);
    const billingRepoPg = new PostgresBillingRepository(db);
    const operationsRepoPg = new PostgresOperationsRepository(db);
    const membersRolesRepo = new PostgresMembersRolesRepository(db);
    const auditLogStore = new PostgresAuditLogStore(db);
    const supportGrantStore = new PostgresSupportGrantStore(db);
    const importApplyPort = createInMemoryImportApplyPort(catalogRepo);
    const catalogPricingPort = buildCatalogPricingPort(catalogRepo);
    const reservationPort = buildReservationPort(inventoryRepo);
    const orderLookupPort = buildOrderLookupPort(orderRepoPg);
    const orderEligibilityPort = buildOrderEligibilityPort(orderRepoPg);
    const conversationOutboundPort = buildConversationOutboundPort(channelRepoPg);
    const conversationLookupPort = buildConversationLookupPort(conversationRepoPg);
    const aiOutboundPort = buildAiOutboundPort(conversationRepoPg, channelRepoPg);
    const aiKnowledgePort = createKnowledgeRetrievalClient({
      async search(args) {
        return searchPublishedKnowledge({
          repo: knowledgeRepoPg,
          tenantId: args.tenantId,
          query: args.query,
          ...(args.topK !== undefined ? { topK: args.topK } : {})
        });
      }
    });
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
        importRepo: importRepoPg,
        importApplyPort
      }),
      createCustomersController({ repo: customerRepo }),
      createInventoryController({ repo: inventoryRepo }),
      createKnowledgeController({ repo: knowledgeRepoPg }),
      createChannelController({ repo: channelRepoPg, adapter: stubFacebookAdapter }),
      createConversationController({
        repo: conversationRepoPg,
        outbound: conversationOutboundPort
      }),
      createOrderController({
        repo: orderRepoPg,
        catalog: catalogPricingPort,
        reservation: reservationPort,
        idempotency
      }),
      createPaymentController({
        repo: paymentRepoPg,
        orders: orderLookupPort,
        idempotency
      }),
      createFulfillmentController({
        repo: fulfillmentRepoPg,
        orders: orderEligibilityPort,
        inventory: inventoryRestockPort
      }),
      createAiOrchestrationController({
        repo: aiOrchestrationRepoPg,
        conversations: conversationLookupPort,
        knowledge: aiKnowledgePort,
        outbound: aiOutboundPort
      }),
      createAnalyticsController({ repo: analyticsRepoPg }),
      createBillingController({ repo: billingRepoPg }),
      // Support-access create stays on createSupportAccessController only
      // (avoids duplicate POST .../support-access that overwrote grantee identity).
      createOperationsController({ repo: operationsRepoPg })
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
