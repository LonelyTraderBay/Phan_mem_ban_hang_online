import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { parse, stringify } from "yaml";

const SOURCE = "backend_doc/contracts/asyncapi.yaml";
const COPY = "packages/contracts-events/asyncapi.yaml";

/** Minimum data payloads from blueprint §9.8 + HO_DEFAULTS / ops gaps. */
const DOMAIN_DATA = {
  tenantActivated: {
    required: ["tenant_id", "plan_id"],
    properties: {
      tenant_id: { type: "string", format: "uuid" },
      plan_id: {
        type: "string",
        enum: ["plan_free", "plan_pro", "plan_business"],
        description: "HO_DEFAULTS_v1",
      },
    },
  },
  tenantSuspended: {
    required: ["tenant_id", "reason", "effective_at"],
    properties: {
      tenant_id: { type: "string", format: "uuid" },
      reason: { type: "string", minLength: 1, maxLength: 1000 },
      effective_at: { type: "string", format: "date-time" },
    },
  },
  membershipChanged: {
    required: ["membership_id", "status", "permission_version"],
    properties: {
      membership_id: { type: "string", format: "uuid" },
      user_id: { type: "string", format: "uuid" },
      status: {
        type: "string",
        enum: ["invited", "active", "suspended", "revoked"],
      },
      permission_version: { type: "integer", minimum: 1 },
      role_ids: { type: "array", items: { type: "string", format: "uuid" } },
    },
  },
  customerUpdated: {
    required: ["customer_id", "changed_fields"],
    properties: {
      customer_id: { type: "string", format: "uuid" },
      changed_fields: { type: "array", items: { type: "string" }, minItems: 1 },
      version: { type: "integer", minimum: 1 },
    },
  },
  customerMerged: {
    required: ["source_ids", "target_id"],
    properties: {
      source_ids: {
        type: "array",
        minItems: 1,
        items: { type: "string", format: "uuid" },
      },
      target_id: { type: "string", format: "uuid" },
    },
  },
  catalogVariantUpdated: {
    required: ["variant_id", "version", "changed_fields"],
    properties: {
      variant_id: { type: "string", format: "uuid" },
      product_id: { type: "string", format: "uuid" },
      version: { type: "integer", minimum: 1 },
      changed_fields: { type: "array", items: { type: "string" }, minItems: 1 },
      unit_price_minor: {
        type: ["integer", "null"],
        description: "Tax-inclusive đồng when price changed (HO_DEFAULTS_v1).",
      },
    },
  },
  inventoryAdjusted: {
    required: ["warehouse_id", "variant_id", "quantity_delta", "reason"],
    properties: {
      warehouse_id: { type: "string", format: "uuid" },
      variant_id: { type: "string", format: "uuid" },
      quantity_delta: { type: "string", pattern: "^-?\\d+(\\.\\d{1,6})?$" },
      reason: { type: "string", minLength: 1, maxLength: 500 },
      adjustment_id: { type: "string", format: "uuid" },
    },
  },
  inventoryReserved: {
    required: ["reservation_id", "allocations", "expires_at"],
    properties: {
      reservation_id: { type: "string", format: "uuid" },
      expires_at: { type: "string", format: "date-time" },
      owner_type: { type: "string", enum: ["order", "conversation", "manual"] },
      owner_id: { type: "string", format: "uuid" },
      allocations: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["variant_id", "warehouse_id", "quantity"],
          properties: {
            variant_id: { type: "string", format: "uuid" },
            warehouse_id: { type: "string", format: "uuid" },
            quantity: { type: "string" },
          },
        },
      },
    },
  },
  inventoryReservationReleased: {
    required: ["reservation_id", "reason"],
    properties: {
      reservation_id: { type: "string", format: "uuid" },
      reason: { type: "string", minLength: 1, maxLength: 500 },
    },
  },
  inventoryReservationExpired: {
    required: ["reservation_id", "owner_type", "owner_id"],
    properties: {
      reservation_id: { type: "string", format: "uuid" },
      owner_type: { type: "string", enum: ["order", "conversation", "manual"] },
      owner_id: { type: "string", format: "uuid" },
    },
  },
  knowledgePublished: {
    required: ["source_version_id"],
    properties: {
      source_version_id: { type: "string", format: "uuid" },
      source_id: { type: "string", format: "uuid" },
      effective_from: { type: ["string", "null"], format: "date-time" },
      effective_to: { type: ["string", "null"], format: "date-time" },
    },
  },
  knowledgeIngestionCompleted: {
    required: ["version_id", "chunk_count"],
    properties: {
      version_id: { type: "string", format: "uuid" },
      chunk_count: { type: "integer", minimum: 0 },
      status: { type: "string", enum: ["completed", "failed"] },
    },
  },
  channelAccountConnected: {
    required: ["account_id", "provider"],
    properties: {
      account_id: { type: "string", format: "uuid" },
      provider: { type: "string", minLength: 1, maxLength: 100 },
      scopes: { type: "array", items: { type: "string" } },
    },
  },
  channelHealthChanged: {
    required: ["account_id", "old_health", "new_health"],
    properties: {
      account_id: { type: "string", format: "uuid" },
      old_health: { type: "string", enum: ["ok", "warn", "error", "unknown"] },
      new_health: { type: "string", enum: ["ok", "warn", "error", "unknown"] },
      reason: { type: ["string", "null"], maxLength: 1000 },
    },
  },
  webhookReceived: {
    required: ["webhook_event_id", "provider"],
    properties: {
      webhook_event_id: { type: "string", format: "uuid" },
      provider: { type: "string" },
      event_type: { type: ["string", "null"] },
    },
  },
  messageInboundNormalized: {
    required: ["message_id", "conversation_id"],
    properties: {
      message_id: { type: "string", format: "uuid" },
      conversation_id: { type: "string", format: "uuid" },
      channel_account_id: { type: ["string", "null"], format: "uuid" },
      content_ref: {
        type: "string",
        description: "Opaque reference — not full PII/body.",
      },
    },
  },
  messageOutboundQueued: {
    required: ["outbound_message_id"],
    properties: {
      outbound_message_id: { type: "string", format: "uuid" },
      conversation_id: { type: "string", format: "uuid" },
    },
  },
  messageOutboundSent: {
    required: ["message_id", "provider_message_id"],
    properties: {
      message_id: { type: "string", format: "uuid" },
      provider_message_id: { type: "string" },
      conversation_id: { type: "string", format: "uuid" },
    },
  },
  messageOutboundFailed: {
    required: ["message_id", "error_class"],
    properties: {
      message_id: { type: "string", format: "uuid" },
      error_class: {
        type: "string",
        enum: ["network", "auth", "validation", "business", "provider", "unknown"],
      },
      conversation_id: { type: "string", format: "uuid" },
    },
  },
  conversationCreated: {
    required: ["conversation_id"],
    properties: {
      conversation_id: { type: "string", format: "uuid" },
      customer_id: { type: ["string", "null"], format: "uuid" },
      channel_account_id: { type: ["string", "null"], format: "uuid" },
    },
  },
  conversationUpdated: {
    required: ["conversation_id", "version"],
    properties: {
      conversation_id: { type: "string", format: "uuid" },
      version: { type: "integer", minimum: 1 },
      changed_fields: { type: "array", items: { type: "string" } },
      status: {
        type: ["string", "null"],
        enum: ["open", "pending", "resolved", "closed", null],
      },
    },
  },
  conversationSlaBreached: {
    required: ["conversation_id", "due_at"],
    properties: {
      conversation_id: { type: "string", format: "uuid" },
      due_at: { type: "string", format: "date-time" },
      assignee_member_id: { type: ["string", "null"], format: "uuid" },
    },
  },
  aiSuggestionCreated: {
    required: ["suggestion_id", "disposition"],
    properties: {
      suggestion_id: { type: "string", format: "uuid" },
      conversation_id: { type: "string", format: "uuid" },
      disposition: {
        type: "string",
        enum: ["draft", "pending_approval", "auto_send_candidate", "blocked"],
      },
    },
  },
  aiOutputBlocked: {
    required: ["rule_id", "severity"],
    properties: {
      rule_id: { type: "string" },
      severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
      suggestion_id: { type: ["string", "null"], format: "uuid" },
      conversation_id: { type: ["string", "null"], format: "uuid" },
    },
  },
  orderDraftCreated: {
    required: ["order_id", "source"],
    properties: {
      order_id: { type: "string", format: "uuid" },
      source: {
        type: "string",
        enum: ["manual", "conversation", "import", "api"],
      },
      customer_id: { type: ["string", "null"], format: "uuid" },
    },
  },
  orderConfirmed: {
    required: [
      "order_id",
      "customer_id",
      "currency",
      "grand_total_minor",
      "tax_rate_bps",
      "prices_tax_inclusive",
      "item_refs",
    ],
    properties: {
      order_id: { type: "string", format: "uuid" },
      customer_id: { type: "string", format: "uuid" },
      currency: { type: "string", minLength: 3, maxLength: 3 },
      subtotal_minor: { type: "integer" },
      discount_minor: { type: "integer" },
      tax_minor: { type: "integer" },
      grand_total_minor: { type: "integer" },
      tax_rate_bps: { type: "integer", const: 1000 },
      prices_tax_inclusive: { type: "boolean", const: true },
      item_refs: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["order_item_id", "variant_id", "quantity"],
          properties: {
            order_item_id: { type: "string", format: "uuid" },
            variant_id: { type: "string", format: "uuid" },
            quantity: { type: "string" },
          },
        },
      },
    },
  },
  orderCancelled: {
    required: ["order_id", "reason"],
    properties: {
      order_id: { type: "string", format: "uuid" },
      reason: { type: "string", minLength: 1, maxLength: 1000 },
    },
  },
  paymentRecorded: {
    required: ["payment_id", "order_id", "amount_minor", "currency", "status"],
    properties: {
      payment_id: { type: "string", format: "uuid" },
      order_id: { type: "string", format: "uuid" },
      amount_minor: { type: "integer" },
      currency: { type: "string", minLength: 3, maxLength: 3 },
      status: {
        type: "string",
        enum: ["pending", "authorized", "captured", "failed"],
      },
    },
  },
  paymentRefunded: {
    required: ["refund_id", "payment_id", "amount_minor"],
    properties: {
      refund_id: { type: "string", format: "uuid" },
      payment_id: { type: "string", format: "uuid" },
      order_id: { type: "string", format: "uuid" },
      amount_minor: { type: "integer", minimum: 1 },
    },
  },
  shipmentCreated: {
    required: ["shipment_id", "order_id"],
    properties: {
      shipment_id: { type: "string", format: "uuid" },
      order_id: { type: "string", format: "uuid" },
    },
  },
  shipmentStatusChanged: {
    required: ["shipment_id", "old_status", "new_status"],
    properties: {
      shipment_id: { type: "string", format: "uuid" },
      order_id: { type: "string", format: "uuid" },
      old_status: {
        type: "string",
        enum: ["pending", "packed", "shipped", "delivered", "cancelled"],
      },
      new_status: {
        type: "string",
        enum: ["pending", "packed", "shipped", "delivered", "cancelled"],
      },
    },
  },
  returnCompleted: {
    required: ["return_id", "order_id"],
    properties: {
      return_id: { type: "string", format: "uuid" },
      order_id: { type: "string", format: "uuid" },
      refund_id: { type: ["string", "null"], format: "uuid" },
      restocked: { type: "boolean" },
    },
  },
  billingUsageRecorded: {
    required: ["meter", "quantity", "period_start", "period_end"],
    properties: {
      meter: {
        type: "string",
        enum: ["orders_created", "ai_suggestions", "channel_accounts"],
      },
      quantity: { type: "integer", minimum: 0 },
      period_start: { type: "string", format: "date-time" },
      period_end: { type: "string", format: "date-time" },
      plan_id: {
        type: ["string", "null"],
        enum: ["plan_free", "plan_pro", "plan_business", null],
      },
    },
  },
  auditRecorded: {
    required: ["audit_id", "action", "resource_type", "resource_id"],
    properties: {
      audit_id: { type: "string", format: "uuid" },
      action: { type: "string", minLength: 1, maxLength: 100 },
      resource_type: { type: "string", minLength: 1, maxLength: 100 },
      resource_id: { type: "string", format: "uuid" },
    },
  },
};

const OPS_EVENTS = {
  opsAlertRaised: {
    type: "com.aisales.ops.alert.raised.v1",
    required: ["alert_id", "severity", "title"],
    properties: {
      alert_id: { type: "string", format: "uuid" },
      tenant_id: { type: ["string", "null"], format: "uuid" },
      severity: { type: "string", enum: ["info", "warn", "error", "critical"] },
      title: { type: "string", minLength: 1, maxLength: 300 },
      source: { type: "string", enum: ["channel", "ai", "billing", "system", "dlq"] },
    },
  },
  opsAlertAcknowledged: {
    type: "com.aisales.ops.alert.acknowledged.v1",
    required: ["alert_id", "acknowledged_by"],
    properties: {
      alert_id: { type: "string", format: "uuid" },
      acknowledged_by: { type: "string", format: "uuid" },
      acknowledged_at: { type: "string", format: "date-time" },
    },
  },
  opsSupportAccessGranted: {
    type: "com.aisales.ops.support_access.granted.v1",
    required: ["grant_id", "tenant_id", "expires_at"],
    properties: {
      grant_id: { type: "string", format: "uuid" },
      tenant_id: { type: "string", format: "uuid" },
      expires_at: { type: "string", format: "date-time" },
      reason: { type: ["string", "null"], maxLength: 1000 },
    },
  },
  opsSupportAccessRevoked: {
    type: "com.aisales.ops.support_access.revoked.v1",
    required: ["grant_id", "tenant_id"],
    properties: {
      grant_id: { type: "string", format: "uuid" },
      tenant_id: { type: "string", format: "uuid" },
    },
  },
  opsTenantAiDisabled: {
    type: "com.aisales.ops.tenant_ai.disabled.v1",
    required: ["tenant_id", "reason"],
    properties: {
      tenant_id: { type: "string", format: "uuid" },
      reason: { type: "string", minLength: 1, maxLength: 1000 },
    },
  },
  opsFeatureFlagChanged: {
    type: "com.aisales.ops.feature_flag.changed.v1",
    required: ["tenant_id", "flag_key", "enabled"],
    properties: {
      tenant_id: { type: "string", format: "uuid" },
      flag_key: { type: "string", minLength: 1, maxLength: 100 },
      enabled: { type: "boolean" },
    },
  },
  opsDlqReprocessRequested: {
    type: "com.aisales.ops.dlq.reprocess_requested.v1",
    required: ["reprocess_id", "target_type", "target_id"],
    properties: {
      reprocess_id: { type: "string", format: "uuid" },
      target_type: {
        type: "string",
        enum: ["webhook", "outbound", "import", "ai_eval"],
      },
      target_id: { type: "string", format: "uuid" },
      reason: { type: ["string", "null"], maxLength: 1000 },
    },
  },
  opsAiKillSwitchActivated: {
    type: "com.aisales.ops.ai.kill_switch.activated.v1",
    required: ["scope", "reason"],
    properties: {
      scope: { type: "string", enum: ["global", "tenant"] },
      tenant_id: { type: ["string", "null"], format: "uuid" },
      reason: { type: "string", minLength: 1, maxLength: 1000 },
    },
  },
  opsChannelHealthCritical: {
    type: "com.aisales.ops.channel.health_critical.v1",
    required: ["account_id", "provider", "health"],
    properties: {
      account_id: { type: "string", format: "uuid" },
      tenant_id: { type: "string", format: "uuid" },
      provider: { type: "string" },
      health: { type: "string", enum: ["error"] },
      reason: { type: ["string", "null"], maxLength: 1000 },
    },
  },
  opsEntitlementLimitExceeded: {
    type: "com.aisales.ops.entitlement.limit_exceeded.v1",
    required: ["tenant_id", "meter", "limit", "observed"],
    properties: {
      tenant_id: { type: "string", format: "uuid" },
      meter: {
        type: "string",
        enum: ["orders_created", "ai_suggestions", "channel_accounts"],
      },
      limit: { type: "integer", minimum: 0 },
      observed: { type: "integer", minimum: 0 },
      plan_id: {
        type: "string",
        enum: ["plan_free", "plan_pro", "plan_business"],
      },
    },
  },
};

function pascal(name) {
  return name[0].toUpperCase() + name.slice(1);
}

function makeMessage(name, eventType) {
  return {
    name,
    title: eventType,
    contentType: "application/json",
    headers: {
      type: "object",
      properties: {
        "event-type": { type: "string", const: eventType },
        "event-id": { type: "string", format: "uuid" },
      },
    },
    payload: { $ref: `#/components/schemas/${pascal(name)}Event` },
    "x-event-type": eventType,
    "x-delivery": "at-least-once",
  };
}

function makeEventSchema(name, eventType, dataDef) {
  const dataName = `${pascal(name)}Data`;
  return {
    dataName,
    dataSchema: {
      type: "object",
      additionalProperties: false,
      required: dataDef.required,
      properties: dataDef.properties,
      description: `Minimum payload for ${eventType} (blueprint §9.8 / W2 freeze).`,
    },
    eventSchema: {
      allOf: [
        { $ref: "#/components/schemas/EventEnvelopeBase" },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "data"],
          properties: {
            type: { type: "string", const: eventType },
            data: { $ref: `#/components/schemas/${dataName}` },
          },
        },
      ],
    },
  };
}

function main() {
  const spec = parse(readFileSync(SOURCE, "utf8"));
  spec.info.description =
    "Frozen AsyncAPI contract for tenant domain events, ops events, and realtime SSE (enterprise doc-freeze W2).";

  // Replace open EventEnvelope with base + typed events
  const actor = spec.components.schemas.Actor;
  const realtime = spec.components.schemas.RealtimeNotification;

  spec.components.schemas = {
    Actor: actor,
    EventEnvelopeBase: {
      type: "object",
      additionalProperties: false,
      required: [
        "specversion",
        "id",
        "source",
        "type",
        "time",
        "datacontenttype",
        "tenantid",
        "correlationid",
        "data",
      ],
      properties: {
        specversion: { type: "string", const: "1.0" },
        id: { type: "string", format: "uuid" },
        source: { type: "string" },
        type: { type: "string" },
        subject: { type: ["string", "null"] },
        time: { type: "string", format: "date-time" },
        datacontenttype: { type: "string", const: "application/json" },
        dataschema: { type: ["string", "null"] },
        tenantid: {
          type: ["string", "null"],
          format: "uuid",
          description:
            "Null only for global ops events (e.g. global AI kill switch).",
        },
        correlationid: { type: "string" },
        causationid: { type: ["string", "null"] },
        partitionkey: { type: ["string", "null"] },
        actor: { $ref: "#/components/schemas/Actor" },
        data: { type: "object" },
      },
    },
    RealtimeNotification: {
      ...realtime,
      properties: {
        ...realtime.properties,
        summary: {
          type: "object",
          additionalProperties: false,
          description: "Non-PII summary fields only.",
          properties: {
            title: { type: ["string", "null"], maxLength: 200 },
            status: { type: ["string", "null"], maxLength: 64 },
          },
        },
      },
    },
    SystemResyncRequired: {
      type: "object",
      additionalProperties: false,
      required: ["schema_version", "reason", "occurred_at"],
      properties: {
        schema_version: { type: "integer", minimum: 1 },
        reason: {
          type: "string",
          enum: ["last_event_id_too_old", "buffer_evicted", "permission_changed"],
        },
        occurred_at: { type: "string", format: "date-time" },
        refetch_hint: { type: ["string", "null"], maxLength: 200 },
      },
    },
  };

  // Domain messages → typed
  const domainMessageNames = Object.keys(spec.channels.domainEvents.messages);
  for (const name of domainMessageNames) {
    const existing = spec.components.messages[name];
    const eventType =
      existing?.["x-event-type"] ||
      existing?.title ||
      `com.aisales.${name}.v1`;
    const dataDef = DOMAIN_DATA[name];
    if (!dataDef) {
      throw new Error(`Missing DOMAIN_DATA for message ${name}`);
    }
    const built = makeEventSchema(name, eventType, dataDef);
    spec.components.schemas[built.dataName] = built.dataSchema;
    spec.components.schemas[`${pascal(name)}Event`] = built.eventSchema;
    spec.components.messages[name] = makeMessage(name, eventType);
  }

  // Ops channel
  const opsMessages = {};
  const opsOpsSend = [];
  const opsOpsRecv = [];
  for (const [name, def] of Object.entries(OPS_EVENTS)) {
    const built = makeEventSchema(name, def.type, def);
    spec.components.schemas[built.dataName] = built.dataSchema;
    spec.components.schemas[`${pascal(name)}Event`] = built.eventSchema;
    spec.components.messages[name] = makeMessage(name, def.type);
    opsMessages[name] = { $ref: `#/components/messages/${name}` };
    opsOpsSend.push({ $ref: `#/channels/opsEvents/messages/${name}` });
    opsOpsRecv.push({ $ref: `#/channels/opsEvents/messages/${name}` });
  }

  spec.channels.opsEvents = {
    address: "ops.events",
    description:
      "Super Admin / operations-scoped events (not tenant SSE by default).",
    messages: opsMessages,
  };

  // Realtime: add systemResyncRequired
  spec.channels.realtimeEvents.messages.systemResyncRequired = {
    $ref: "#/components/messages/systemResyncRequired",
  };
  spec.components.messages.systemResyncRequired = {
    name: "systemResyncRequired",
    title: "system.resync_required",
    contentType: "application/json",
    payload: { $ref: "#/components/schemas/SystemResyncRequired" },
    "x-event-type": "system.resync_required",
    "x-delivery": "sse",
  };

  spec.operations.publishOpsEvents = {
    action: "send",
    channel: { $ref: "#/channels/opsEvents" },
    messages: opsOpsSend,
  };
  spec.operations.consumeOpsEvents = {
    action: "receive",
    channel: { $ref: "#/channels/opsEvents" },
    messages: opsOpsRecv,
  };

  // Extend sendRealtimeEvents messages
  const rtMsgs = spec.operations.sendRealtimeEvents.messages || [];
  if (!rtMsgs.some((m) => String(m.$ref).includes("systemResyncRequired"))) {
    rtMsgs.push({
      $ref: "#/channels/realtimeEvents/messages/systemResyncRequired",
    });
    spec.operations.sendRealtimeEvents.messages = rtMsgs;
  }

  // Remove deprecated open EventEnvelope if present
  delete spec.components.schemas.EventEnvelope;

  const out = stringify(spec, { lineWidth: 0, defaultKeyType: "PLAIN", defaultStringType: "PLAIN" });
  writeFileSync(SOURCE, out);
  copyFileSync(SOURCE, COPY);

  // Inventory
  const rows = [
    "scope,message,event_type,data_schema,status",
    ...domainMessageNames.map(
      (n) =>
        `tenant,${n},${spec.components.messages[n]["x-event-type"]},${pascal(n)}Data,frozen`,
    ),
    ...Object.keys(OPS_EVENTS).map(
      (n) =>
        `ops,${n},${OPS_EVENTS[n].type},${pascal(n)}Data,frozen`,
    ),
    "realtime,realtimeNotification,realtime.notification,RealtimeNotification,frozen",
    "realtime,systemResyncRequired,system.resync_required,SystemResyncRequired,frozen",
  ];
  writeFileSync(
    "docs/enterprise-freeze/inventory/asyncapi_event_coverage.csv",
    rows.join("\n") + "\n",
  );

  console.log(
    JSON.stringify(
      {
        domainMessages: domainMessageNames.length,
        opsMessages: Object.keys(OPS_EVENTS).length,
        schemas: Object.keys(spec.components.schemas).length,
        messages: Object.keys(spec.components.messages).length,
      },
      null,
      2,
    ),
  );
}

main();
