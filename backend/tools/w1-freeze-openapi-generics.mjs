import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { parse, stringify } from "yaml";

const SOURCE = "backend_doc/contracts/openapi.yaml";
const COPY = "packages/contracts-http/openapi.yaml";

const genericRe =
  /#\/components\/schemas\/Generic(CommandRequest|DataResponse|Resource|ListResponse)$/;

function collectRefs(node, out = []) {
  if (!node || typeof node !== "object") return out;
  if (typeof node.$ref === "string") out.push(node.$ref);
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) v.forEach((i) => collectRefs(i, out));
    else if (v && typeof v === "object") collectRefs(v, out);
  }
  return out;
}

function pascal(operationId) {
  return operationId[0].toUpperCase() + operationId.slice(1);
}

/** Resource schemas keyed by tag — frozen field sets from blueprint + HO_DEFAULTS. */
const RESOURCE_BY_TAG = {
  Tenant: {
    required: ["id", "code", "name", "status", "version", "created_at", "updated_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      code: { type: "string", minLength: 1, maxLength: 100 },
      name: { type: "string", minLength: 1, maxLength: 200 },
      status: { type: "string", enum: ["active", "suspended", "closed"] },
      plan_id: {
        type: ["string", "null"],
        description: "Billing plan id from HO_DEFAULTS_v1 (plan_free|plan_pro|plan_business).",
      },
      version: { type: "integer", minimum: 1 },
      created_at: { type: "string", format: "date-time" },
      updated_at: { type: "string", format: "date-time" },
    },
  },
  Members: {
    required: ["id", "user_id", "tenant_id", "status", "version", "created_at", "updated_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      user_id: { type: "string", format: "uuid" },
      tenant_id: { type: "string", format: "uuid" },
      email: { type: "string", format: "email", maxLength: 320 },
      display_name: { type: ["string", "null"], maxLength: 200 },
      status: {
        type: "string",
        enum: ["invited", "active", "suspended", "revoked"],
      },
      role_ids: { type: "array", items: { type: "string", format: "uuid" } },
      version: { type: "integer", minimum: 1 },
      created_at: { type: "string", format: "date-time" },
      updated_at: { type: "string", format: "date-time" },
    },
  },
  Roles: {
    required: ["id", "tenant_id", "name", "permissions", "version", "created_at", "updated_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      tenant_id: { type: "string", format: "uuid" },
      name: { type: "string", minLength: 1, maxLength: 100 },
      description: { type: ["string", "null"], maxLength: 1000 },
      permissions: { type: "array", items: { type: "string", minLength: 1 } },
      version: { type: "integer", minimum: 1 },
      created_at: { type: "string", format: "date-time" },
      updated_at: { type: "string", format: "date-time" },
    },
  },
  Customers: {
    required: ["id", "tenant_id", "status", "version", "created_at", "updated_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      tenant_id: { type: "string", format: "uuid" },
      display_name: { type: ["string", "null"], maxLength: 300 },
      primary_email: { type: ["string", "null"], format: "email", maxLength: 320 },
      primary_phone: { type: ["string", "null"], maxLength: 32 },
      status: { type: "string", enum: ["active", "merged", "anonymized"] },
      tags: { type: "array", items: { type: "string" } },
      version: { type: "integer", minimum: 1 },
      created_at: { type: "string", format: "date-time" },
      updated_at: { type: "string", format: "date-time" },
    },
  },
  Catalog: {
    required: ["id", "tenant_id", "name", "status", "version", "created_at", "updated_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      tenant_id: { type: "string", format: "uuid" },
      name: { type: "string", minLength: 1, maxLength: 300 },
      description: { type: ["string", "null"], maxLength: 20000 },
      category_id: { type: ["string", "null"], format: "uuid" },
      brand: { type: ["string", "null"], maxLength: 200 },
      status: { type: "string", enum: ["draft", "active", "archived"] },
      version: { type: "integer", minimum: 1 },
      created_at: { type: "string", format: "date-time" },
      updated_at: { type: "string", format: "date-time" },
    },
  },
  Imports: {
    required: ["id", "tenant_id", "status", "version", "created_at", "updated_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      tenant_id: { type: "string", format: "uuid" },
      source_type: { type: "string", enum: ["csv", "xlsx", "api"] },
      status: {
        type: "string",
        enum: [
          "uploaded",
          "mapped",
          "analyzing",
          "preview_ready",
          "confirming",
          "applied",
          "failed",
          "cancelled",
        ],
      },
      row_count: { type: ["integer", "null"], minimum: 0 },
      error_count: { type: ["integer", "null"], minimum: 0 },
      version: { type: "integer", minimum: 1 },
      created_at: { type: "string", format: "date-time" },
      updated_at: { type: "string", format: "date-time" },
    },
  },
  Inventory: {
    required: ["id", "tenant_id", "status", "version", "created_at", "updated_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      tenant_id: { type: "string", format: "uuid" },
      status: { type: "string" },
      version: { type: "integer", minimum: 1 },
      created_at: { type: "string", format: "date-time" },
      updated_at: { type: "string", format: "date-time" },
    },
  },
  Knowledge: {
    required: ["id", "tenant_id", "status", "version", "created_at", "updated_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      tenant_id: { type: "string", format: "uuid" },
      title: { type: ["string", "null"], maxLength: 500 },
      status: {
        type: "string",
        enum: ["draft", "in_review", "approved", "published", "archived"],
      },
      version: { type: "integer", minimum: 1 },
      created_at: { type: "string", format: "date-time" },
      updated_at: { type: "string", format: "date-time" },
    },
  },
  Channels: {
    required: ["id", "tenant_id", "provider", "status", "version", "created_at", "updated_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      tenant_id: { type: "string", format: "uuid" },
      provider: { type: "string", minLength: 1, maxLength: 100 },
      display_name: { type: ["string", "null"], maxLength: 200 },
      status: {
        type: "string",
        enum: ["connecting", "active", "degraded", "disconnected", "revoked"],
      },
      health: { type: ["string", "null"], enum: ["ok", "warn", "error", null] },
      version: { type: "integer", minimum: 1 },
      created_at: { type: "string", format: "date-time" },
      updated_at: { type: "string", format: "date-time" },
    },
  },
  Webhooks: {
    required: ["id", "tenant_id", "provider", "status", "received_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      tenant_id: { type: ["string", "null"], format: "uuid" },
      provider: { type: "string" },
      event_type: { type: ["string", "null"] },
      status: {
        type: "string",
        enum: ["received", "normalized", "failed", "reprocessed", "dead_letter"],
      },
      received_at: { type: "string", format: "date-time" },
    },
  },
  Conversations: {
    required: ["id", "tenant_id", "status", "version", "created_at", "updated_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      tenant_id: { type: "string", format: "uuid" },
      channel_account_id: { type: ["string", "null"], format: "uuid" },
      customer_id: { type: ["string", "null"], format: "uuid" },
      assignee_member_id: { type: ["string", "null"], format: "uuid" },
      status: {
        type: "string",
        enum: ["open", "pending", "resolved", "closed"],
      },
      ai_takeover: { type: "boolean" },
      version: { type: "integer", minimum: 1 },
      created_at: { type: "string", format: "date-time" },
      updated_at: { type: "string", format: "date-time" },
    },
  },
  Orders: {
    required: [
      "id",
      "tenant_id",
      "order_code",
      "status",
      "currency",
      "grand_total_minor",
      "tax_rate_bps",
      "prices_tax_inclusive",
      "version",
      "created_at",
      "updated_at",
    ],
    properties: {
      id: { type: "string", format: "uuid" },
      tenant_id: { type: "string", format: "uuid" },
      order_code: { type: "string", minLength: 1, maxLength: 64 },
      customer_id: { type: ["string", "null"], format: "uuid" },
      status: {
        type: "string",
        enum: ["draft", "reserved", "confirmed", "cancelled", "expired"],
      },
      currency: { type: "string", minLength: 3, maxLength: 3 },
      subtotal_minor: { type: "integer" },
      discount_minor: { type: "integer" },
      tax_minor: { type: "integer" },
      grand_total_minor: { type: "integer" },
      tax_rate_bps: {
        type: "integer",
        const: 1000,
        description: "HO_DEFAULTS_v1 — 10% VAT",
      },
      prices_tax_inclusive: {
        type: "boolean",
        const: true,
        description: "HO_DEFAULTS_v1 — catalog prices include VAT",
      },
      version: { type: "integer", minimum: 1 },
      created_at: { type: "string", format: "date-time" },
      updated_at: { type: "string", format: "date-time" },
    },
  },
  Payments: {
    required: ["id", "tenant_id", "order_id", "status", "amount_minor", "currency", "version", "created_at", "updated_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      tenant_id: { type: "string", format: "uuid" },
      order_id: { type: "string", format: "uuid" },
      status: {
        type: "string",
        enum: ["pending", "authorized", "captured", "failed", "refunded", "partially_refunded"],
      },
      amount_minor: { type: "integer" },
      currency: { type: "string", minLength: 3, maxLength: 3 },
      provider: { type: ["string", "null"] },
      version: { type: "integer", minimum: 1 },
      created_at: { type: "string", format: "date-time" },
      updated_at: { type: "string", format: "date-time" },
    },
  },
  Shipments: {
    required: ["id", "tenant_id", "order_id", "status", "version", "created_at", "updated_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      tenant_id: { type: "string", format: "uuid" },
      order_id: { type: "string", format: "uuid" },
      status: {
        type: "string",
        enum: ["pending", "packed", "shipped", "delivered", "cancelled"],
      },
      carrier: { type: ["string", "null"], maxLength: 100 },
      tracking_code: { type: ["string", "null"], maxLength: 200 },
      version: { type: "integer", minimum: 1 },
      created_at: { type: "string", format: "date-time" },
      updated_at: { type: "string", format: "date-time" },
    },
  },
  Returns: {
    required: ["id", "tenant_id", "order_id", "status", "version", "created_at", "updated_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      tenant_id: { type: "string", format: "uuid" },
      order_id: { type: "string", format: "uuid" },
      status: {
        type: "string",
        enum: ["requested", "approved", "received", "completed", "rejected"],
      },
      reason: { type: ["string", "null"], maxLength: 2000 },
      version: { type: "integer", minimum: 1 },
      created_at: { type: "string", format: "date-time" },
      updated_at: { type: "string", format: "date-time" },
    },
  },
  AI: {
    required: ["id", "tenant_id", "status", "created_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      tenant_id: { type: "string", format: "uuid" },
      status: { type: "string" },
      created_at: { type: "string", format: "date-time" },
      updated_at: { type: ["string", "null"], format: "date-time" },
    },
  },
  Analytics: {
    required: ["generated_at"],
    properties: {
      generated_at: { type: "string", format: "date-time" },
      currency: { type: ["string", "null"], minLength: 3, maxLength: 3 },
      metrics: {
        type: "object",
        additionalProperties: {
          type: ["number", "integer", "string", "null"],
        },
        description: "Metric keys must exist in metric catalog (W3/F09).",
      },
    },
  },
  Billing: {
    required: ["plan_id", "status"],
    properties: {
      plan_id: {
        type: "string",
        enum: ["plan_free", "plan_pro", "plan_business"],
        description: "HO_DEFAULTS_v1",
      },
      status: { type: "string", enum: ["active", "past_due", "cancelled"] },
      seats_used: { type: ["integer", "null"], minimum: 0 },
      seats_limit: { type: ["integer", "null"], minimum: 0 },
      period_start: { type: ["string", "null"], format: "date-time" },
      period_end: { type: ["string", "null"], format: "date-time" },
      usage: {
        type: "object",
        additionalProperties: false,
        properties: {
          orders_created: { type: "integer", minimum: 0 },
          ai_suggestions: { type: "integer", minimum: 0 },
          channel_accounts: { type: "integer", minimum: 0 },
        },
      },
    },
  },
  Operations: {
    required: ["id", "status", "created_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      status: { type: "string" },
      tenant_id: { type: ["string", "null"], format: "uuid" },
      created_at: { type: "string", format: "date-time" },
      detail: { type: ["object", "null"], additionalProperties: true },
    },
  },
  Audit: {
    required: ["id", "status", "created_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      status: { type: "string", enum: ["queued", "running", "completed", "failed"] },
      download_url: { type: ["string", "null"], format: "uri" },
      created_at: { type: "string", format: "date-time" },
    },
  },
  Sessions: {
    required: [
      "id",
      "user_id",
      "device_id",
      "current",
      "revoked",
      "created_at",
      "absolute_expiry",
    ],
    properties: {
      id: { type: "string", format: "uuid" },
      user_id: { type: "string", format: "uuid" },
      tenant_id: { type: ["string", "null"], format: "uuid" },
      device_id: { type: "string", format: "uuid" },
      current: { type: "boolean" },
      revoked: { type: "boolean" },
      created_at: { type: "string", format: "date-time" },
      last_seen_at: { type: ["string", "null"], format: "date-time" },
      absolute_expiry: { type: "string", format: "date-time" },
      user_agent: { type: ["string", "null"], maxLength: 512 },
      ip_hint: { type: ["string", "null"], maxLength: 64 },
    },
  },
  Devices: {
    required: ["id", "user_id", "platform", "trusted", "created_at"],
    properties: {
      id: { type: "string", format: "uuid" },
      user_id: { type: "string", format: "uuid" },
      platform: {
        type: "string",
        enum: ["web", "windows", "ios", "android", "other"],
      },
      label: { type: ["string", "null"], maxLength: 200 },
      trusted: { type: "boolean" },
      current: { type: "boolean" },
      created_at: { type: "string", format: "date-time" },
      last_seen_at: { type: ["string", "null"], format: "date-time" },
      trust_status: {
        type: "string",
        enum: ["trusted", "pending", "revoked"],
      },
    },
  },
};

const REQUEST_BY_OPERATION = {
  inviteMember: {
    required: ["email"],
    properties: {
      email: { type: "string", format: "email", maxLength: 320 },
      display_name: { type: ["string", "null"], maxLength: 200 },
      role_ids: {
        type: "array",
        minItems: 1,
        items: { type: "string", format: "uuid" },
      },
    },
  },
  createRole: {
    required: ["name", "permissions"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 100 },
      description: { type: ["string", "null"], maxLength: 1000 },
      permissions: { type: "array", minItems: 1, items: { type: "string" } },
    },
  },
  updateRole: {
    required: ["expected_version"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      name: { type: ["string", "null"], minLength: 1, maxLength: 100 },
      description: { type: ["string", "null"], maxLength: 1000 },
      permissions: { type: ["array", "null"], items: { type: "string" } },
    },
  },
  replaceMemberRoles: {
    required: ["role_ids", "expected_version"],
    properties: {
      role_ids: { type: "array", items: { type: "string", format: "uuid" } },
      expected_version: { type: "integer", minimum: 1 },
    },
  },
  createCustomer: {
    required: [],
    properties: {
      display_name: { type: ["string", "null"], maxLength: 300 },
      primary_email: { type: ["string", "null"], format: "email", maxLength: 320 },
      primary_phone: { type: ["string", "null"], maxLength: 32 },
      tags: { type: "array", items: { type: "string" } },
    },
  },
  updateCustomer: {
    required: ["expected_version"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      display_name: { type: ["string", "null"], maxLength: 300 },
      primary_email: { type: ["string", "null"], format: "email", maxLength: 320 },
      primary_phone: { type: ["string", "null"], maxLength: 32 },
    },
  },
  updateCurrentTenant: {
    required: ["expected_version"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      name: { type: ["string", "null"], minLength: 1, maxLength: 200 },
    },
  },
  createWarehouse: {
    required: ["name", "code"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 200 },
      code: { type: "string", minLength: 1, maxLength: 64 },
      address: { type: ["string", "null"], maxLength: 500 },
    },
  },
  updateWarehouse: {
    required: ["expected_version"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      name: { type: ["string", "null"], minLength: 1, maxLength: 200 },
      address: { type: ["string", "null"], maxLength: 500 },
    },
  },
  createCategory: {
    required: ["name"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 200 },
      parent_id: { type: ["string", "null"], format: "uuid" },
    },
  },
  updateCategory: {
    required: ["expected_version"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      name: { type: ["string", "null"], minLength: 1, maxLength: 200 },
      parent_id: { type: ["string", "null"], format: "uuid" },
    },
  },
  createVariant: {
    required: ["sku"],
    properties: {
      sku: { type: "string", minLength: 1, maxLength: 100 },
      name: { type: ["string", "null"], maxLength: 300 },
      unit_price_minor: {
        type: "integer",
        description: "Tax-inclusive price in đồng (HO_DEFAULTS_v1).",
      },
      currency: { type: "string", minLength: 3, maxLength: 3, default: "VND" },
      attributes: { type: "object", additionalProperties: true },
    },
  },
  updateProduct: {
    required: ["expected_version"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      name: { type: ["string", "null"], minLength: 1, maxLength: 300 },
      description: { type: ["string", "null"], maxLength: 20000 },
      category_id: { type: ["string", "null"], format: "uuid" },
      brand: { type: ["string", "null"], maxLength: 200 },
      status: { type: ["string", "null"], enum: ["draft", "active", null] },
    },
  },
  updateVariant: {
    required: ["expected_version"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      name: { type: ["string", "null"], maxLength: 300 },
      unit_price_minor: { type: ["integer", "null"] },
      status: { type: ["string", "null"], enum: ["active", "archived", null] },
    },
  },
  attachProductMedia: {
    required: ["upload_id"],
    properties: {
      upload_id: { type: "string", format: "uuid" },
      alt_text: { type: ["string", "null"], maxLength: 500 },
      sort_order: { type: ["integer", "null"], minimum: 0 },
    },
  },
  createMediaUploadIntent: {
    required: ["filename", "content_type", "byte_size"],
    properties: {
      filename: { type: "string", minLength: 1, maxLength: 255 },
      content_type: { type: "string", minLength: 3, maxLength: 100 },
      byte_size: { type: "integer", minimum: 1 },
    },
  },
  createImportJob: {
    required: ["source_type"],
    properties: {
      source_type: { type: "string", enum: ["csv", "xlsx", "api"] },
      upload_id: { type: ["string", "null"], format: "uuid" },
    },
  },
  updateImportMapping: {
    required: ["mapping"],
    properties: {
      mapping: {
        type: "object",
        additionalProperties: { type: "string" },
        description: "source_column -> canonical_field",
      },
    },
  },
  createInventoryAdjustment: {
    required: ["warehouse_id", "variant_id", "quantity_delta", "reason"],
    properties: {
      warehouse_id: { type: "string", format: "uuid" },
      variant_id: { type: "string", format: "uuid" },
      quantity_delta: { type: "string", pattern: "^-?\\d+(\\.\\d{1,6})?$" },
      reason: { type: "string", minLength: 1, maxLength: 500 },
    },
  },
  createInventoryReconciliation: {
    required: ["warehouse_id"],
    properties: {
      warehouse_id: { type: "string", format: "uuid" },
      notes: { type: ["string", "null"], maxLength: 2000 },
    },
  },
  extendInventoryReservation: {
    required: ["expires_at", "expected_version"],
    properties: {
      expires_at: { type: "string", format: "date-time" },
      expected_version: { type: "integer", minimum: 1 },
    },
  },
  createKnowledgeSource: {
    required: ["name", "type"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 300 },
      type: { type: "string", enum: ["url", "upload", "manual"] },
      uri: { type: ["string", "null"], format: "uri" },
    },
  },
  createKnowledgeVersion: {
    required: ["source_id", "title"],
    properties: {
      source_id: { type: "string", format: "uuid" },
      title: { type: "string", minLength: 1, maxLength: 500 },
      body_markdown: { type: ["string", "null"], maxLength: 200000 },
    },
  },
  updateKnowledgeVersion: {
    required: ["expected_version"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      title: { type: ["string", "null"], maxLength: 500 },
      body_markdown: { type: ["string", "null"], maxLength: 200000 },
    },
  },
  testKnowledgeSearch: {
    required: ["query"],
    properties: {
      query: { type: "string", minLength: 1, maxLength: 2000 },
      top_k: { type: "integer", minimum: 1, maximum: 50, default: 5 },
    },
  },
  connectChannel: {
    required: ["provider"],
    properties: {
      provider: { type: "string", minLength: 1, maxLength: 100 },
      display_name: { type: ["string", "null"], maxLength: 200 },
      oauth_return_path: { type: ["string", "null"], maxLength: 500 },
    },
  },
  channelOAuthCallback: {
    required: ["state", "code"],
    properties: {
      state: { type: "string", minLength: 8, maxLength: 512 },
      code: { type: "string", minLength: 8, maxLength: 2048 },
    },
  },
  assignConversation: {
    required: ["assignee_member_id", "expected_version"],
    properties: {
      assignee_member_id: { type: "string", format: "uuid" },
      expected_version: { type: "integer", minimum: 1 },
    },
  },
  addConversationNote: {
    required: ["body"],
    properties: {
      body: { type: "string", minLength: 1, maxLength: 10000 },
    },
  },
  updateConversationMetadata: {
    required: ["expected_version"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      metadata: { type: "object", additionalProperties: true },
    },
  },
  updateOrderDraft: {
    required: ["expected_version"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      shipping_address_id: { type: ["string", "null"], format: "uuid" },
      notes: { type: ["string", "null"], maxLength: 2000 },
      items: {
        type: ["array", "null"],
        items: {
          type: "object",
          additionalProperties: false,
          required: ["variant_id", "quantity"],
          properties: {
            variant_id: { type: "string", format: "uuid" },
            quantity: { type: "string" },
          },
        },
      },
    },
  },
  cancelOrder: {
    required: ["expected_version", "reason"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      reason: { type: "string", minLength: 1, maxLength: 1000 },
    },
  },
  recordPayment: {
    required: ["amount_minor", "currency", "method"],
    properties: {
      amount_minor: { type: "integer", minimum: 1 },
      currency: { type: "string", minLength: 3, maxLength: 3 },
      method: { type: "string", enum: ["cod", "transfer", "card", "ewallet", "other"] },
      provider_ref: { type: ["string", "null"], maxLength: 200 },
    },
  },
  confirmPayment: {
    required: ["expected_version"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      provider_ref: { type: ["string", "null"], maxLength: 200 },
    },
  },
  createRefund: {
    required: ["amount_minor", "reason"],
    properties: {
      amount_minor: { type: "integer", minimum: 1 },
      reason: { type: "string", minLength: 1, maxLength: 1000 },
    },
  },
  createShipment: {
    required: ["items"],
    properties: {
      carrier: { type: ["string", "null"], maxLength: 100 },
      tracking_code: { type: ["string", "null"], maxLength: 200 },
      items: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["order_item_id", "quantity"],
          properties: {
            order_item_id: { type: "string", format: "uuid" },
            quantity: { type: "string" },
          },
        },
      },
    },
  },
  updateShipment: {
    required: ["expected_version"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      carrier: { type: ["string", "null"], maxLength: 100 },
      tracking_code: { type: ["string", "null"], maxLength: 200 },
    },
  },
  createReturn: {
    required: ["items", "reason"],
    properties: {
      reason: { type: "string", minLength: 1, maxLength: 2000 },
      items: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["order_item_id", "quantity"],
          properties: {
            order_item_id: { type: "string", format: "uuid" },
            quantity: { type: "string" },
          },
        },
      },
    },
  },
  createPromptVersion: {
    required: ["name", "content"],
    properties: {
      name: { type: "string", minLength: 1, maxLength: 200 },
      content: { type: "string", minLength: 1, maxLength: 100000 },
      risk_level: { type: "string", enum: ["low", "medium", "high"], default: "medium" },
    },
  },
  sendAISuggestion: {
    // already have AISuggestionRequest — map separately
  },
  createReportExport: {
    required: ["report_type"],
    properties: {
      report_type: {
        type: "string",
        enum: ["revenue", "gross_profit", "sla", "ai_quality"],
      },
      from: { type: ["string", "null"], format: "date-time" },
      to: { type: ["string", "null"], format: "date-time" },
    },
  },
  manualUpdateSubscription: {
    required: ["plan_id"],
    properties: {
      plan_id: {
        type: "string",
        enum: ["plan_free", "plan_pro", "plan_business"],
        description: "HO_DEFAULTS_v1",
      },
      reason: { type: ["string", "null"], maxLength: 1000 },
    },
  },
  setTenantFeatureFlag: {
    required: ["flag_key", "enabled"],
    properties: {
      flag_key: { type: "string", minLength: 1, maxLength: 100 },
      enabled: { type: "boolean" },
    },
  },
  createSupportAccess: {
    required: ["tenant_id", "expires_at"],
    properties: {
      tenant_id: { type: "string", format: "uuid" },
      expires_at: { type: "string", format: "date-time" },
      reason: { type: "string", minLength: 1, maxLength: 1000 },
    },
  },
  createReprocessRequest: {
    required: ["target_type", "target_id"],
    properties: {
      target_type: { type: "string", enum: ["webhook", "outbound", "import", "ai_eval"] },
      target_id: { type: "string", format: "uuid" },
      reason: { type: ["string", "null"], maxLength: 1000 },
    },
  },
  createAuditExport: {
    required: ["from", "to"],
    properties: {
      from: { type: "string", format: "date-time" },
      to: { type: "string", format: "date-time" },
      actor_user_id: { type: ["string", "null"], format: "uuid" },
    },
  },
  addCustomerIdentity: {
    required: ["type", "value"],
    properties: {
      type: { type: "string", enum: ["email", "phone", "external"] },
      value: { type: "string", minLength: 1, maxLength: 320 },
    },
  },
  addCustomerAddress: {
    required: ["line1", "country"],
    properties: {
      line1: { type: "string", minLength: 1, maxLength: 300 },
      line2: { type: ["string", "null"], maxLength: 300 },
      city: { type: ["string", "null"], maxLength: 100 },
      province: { type: ["string", "null"], maxLength: 100 },
      postal_code: { type: ["string", "null"], maxLength: 32 },
      country: { type: "string", minLength: 2, maxLength: 2 },
    },
  },
  updateCustomerAddress: {
    required: ["expected_version"],
    properties: {
      expected_version: { type: "integer", minimum: 1 },
      line1: { type: ["string", "null"], maxLength: 300 },
      line2: { type: ["string", "null"], maxLength: 300 },
      city: { type: ["string", "null"], maxLength: 100 },
      province: { type: ["string", "null"], maxLength: 100 },
      postal_code: { type: ["string", "null"], maxLength: 32 },
      country: { type: ["string", "null"], minLength: 2, maxLength: 2 },
    },
  },
  addCustomerTag: {
    required: ["tag"],
    properties: { tag: { type: "string", minLength: 1, maxLength: 64 } },
  },
  addCustomerNote: {
    required: ["body"],
    properties: { body: { type: "string", minLength: 1, maxLength: 10000 } },
  },
  previewCustomerMerge: {
    required: ["survivor_id", "merge_ids"],
    properties: {
      survivor_id: { type: "string", format: "uuid" },
      merge_ids: {
        type: "array",
        minItems: 1,
        items: { type: "string", format: "uuid" },
      },
    },
  },
  mergeCustomers: {
    required: ["survivor_id", "merge_ids", "confirmation_token"],
    properties: {
      survivor_id: { type: "string", format: "uuid" },
      merge_ids: {
        type: "array",
        minItems: 1,
        items: { type: "string", format: "uuid" },
      },
      confirmation_token: { type: "string", minLength: 8, maxLength: 128 },
    },
  },
};

const EXISTING_REQUEST_ALIASES = {
  createProduct: "ProductCreateRequest",
  createOrderDraft: "OrderDraftCreateRequest",
  confirmOrder: "ConfirmOrderRequest",
  sendAISuggestion: "AISuggestionRequest",
  // inventory reservation create if any
};

const EMPTY_BODY_OPS = new Set([
  "activateMember",
  "suspendMember",
  "revokeMember",
  "resendInvitation",
  "archiveProduct",
  "archiveCategory",
  "archiveVariant",
  "analyzeImport",
  "confirmImport",
  "cancelImport",
  "releaseInventoryReservation",
  "convertInventoryReservation",
  "approveKnowledgeVersion",
  "archiveKnowledgeVersion",
  "publishKnowledgeVersion",
  "submitKnowledgeReview",
  "disconnectChannel",
  "refreshChannelHealth",
  "retryOutboundMessage",
  "reprocessWebhookEvent",
  "unassignConversation",
  "resolveConversation",
  "reopenConversation",
  "escalateConversation",
  "takeOverConversation",
  "releaseConversationTakeover",
  "recalculateOrder",
  "reserveOrderInventory",
  "expireOrder",
  "markShipmentPacked",
  "markShipmentShipped",
  "markShipmentDelivered",
  "createPackingSlipJob",
  "approveReturn",
  "receiveReturn",
  "completeReturn",
  "approvePromptVersion",
  "activatePromptVersion",
  "rollbackPromptVersion",
  "approveAISuggestion",
  "runPromptEvaluation",
  "evaluateAIResponse",
  "enableAI",
  "disableAI",
  "testAIMessage",
  "disableTenantAI",
  "anonymizeCustomer",
  "createCustomerPrivacyExport",
]);

function resourceSchemaName(tag) {
  const map = {
    Tenant: "TenantResource",
    Members: "MemberResource",
    Roles: "RoleResource",
    Customers: "CustomerResource",
    Catalog: "CatalogResource",
    Imports: "ImportJobResource",
    Inventory: "InventoryResource",
    Knowledge: "KnowledgeResource",
    Channels: "ChannelAccountResource",
    Webhooks: "WebhookEventResource",
    Conversations: "ConversationResource",
    Orders: "OrderResource",
    Payments: "PaymentResource",
    Shipments: "ShipmentResource",
    Returns: "ReturnResource",
    AI: "AIResource",
    Analytics: "AnalyticsReportResource",
    Billing: "BillingResource",
    Operations: "OperationsResource",
    Audit: "AuditExportResource",
    Sessions: "SessionsResource",
    Devices: "DevicesResource",
  };
  return map[tag] || `${tag.replace(/[^A-Za-z0-9]/g, "")}Resource`;
}

function ensureResourceSchemas(spec) {
  for (const [tag, def] of Object.entries(RESOURCE_BY_TAG)) {
    const name = resourceSchemaName(tag);
    if (spec.components.schemas[name]) continue;
    spec.components.schemas[name] = {
      type: "object",
      additionalProperties: false,
      required: def.required,
      properties: def.properties,
      description: `Frozen resource schema for OpenAPI tag ${tag} (enterprise doc-freeze W1).`,
    };
  }
}

function dataResponseSchema(resourceName) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["data", "meta"],
    properties: {
      data: { $ref: `#/components/schemas/${resourceName}` },
      meta: { $ref: "#/components/schemas/Meta" },
    },
  };
}

function listResponseSchema(resourceName) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["data", "page_info", "meta"],
    properties: {
      data: {
        type: "array",
        items: { $ref: `#/components/schemas/${resourceName}` },
      },
      page_info: { $ref: "#/components/schemas/PageInfo" },
      meta: { $ref: "#/components/schemas/Meta" },
    },
  };
}

function replaceRef(node, fromRef, toRef) {
  if (!node || typeof node !== "object") return;
  if (node.$ref === fromRef) node.$ref = toRef;
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) v.forEach((i) => replaceRef(i, fromRef, toRef));
    else if (v && typeof v === "object") replaceRef(v, fromRef, toRef);
  }
}

function main() {
  const spec = parse(readFileSync(SOURCE, "utf8"));
  ensureResourceSchemas(spec);

  let changedOps = 0;
  const debtClosed = [];

  for (const [pathKey, item] of Object.entries(spec.paths || {})) {
    for (const [method, op] of Object.entries(item)) {
      if (!op || typeof op !== "object" || !op.operationId) continue;
      const refs = collectRefs(op);
      const genericRefs = refs.filter((r) => genericRe.test(r));
      if (genericRefs.length === 0) continue;

      const tag = (op.tags && op.tags[0]) || "Operations";
      const resourceName = resourceSchemaName(tag);
      const opPascal = pascal(op.operationId);

      // Request body
      if (op.requestBody) {
        const reqRefs = collectRefs(op.requestBody).filter((r) =>
          /GenericCommandRequest$/.test(r),
        );
        if (reqRefs.length) {
          let reqName;
          if (EXISTING_REQUEST_ALIASES[op.operationId]) {
            reqName = EXISTING_REQUEST_ALIASES[op.operationId];
          } else if (EMPTY_BODY_OPS.has(op.operationId)) {
            reqName = "EmptyCommandRequest";
          } else if (REQUEST_BY_OPERATION[op.operationId]) {
            reqName = `${opPascal}Request`;
            if (!spec.components.schemas[reqName]) {
              const def = REQUEST_BY_OPERATION[op.operationId];
              spec.components.schemas[reqName] = {
                type: "object",
                additionalProperties: false,
                required: def.required || [],
                properties: def.properties || {},
                description: `Request body for ${op.operationId} (W1 freeze).`,
              };
            }
          } else {
            // Fallback: empty command — forces explicit follow-up if body needed
            reqName = "EmptyCommandRequest";
            debtClosed.push({
              operation_id: op.operationId,
              notes: "request_defaulted_EmptyCommandRequest_review_if_body_needed",
            });
          }
          replaceRef(
            op.requestBody,
            "#/components/schemas/GenericCommandRequest",
            `#/components/schemas/${reqName}`,
          );
        }
      }

      // Responses — replace GenericDataResponse / GenericListResponse / GenericResource
      const resName = `${opPascal}Response`;
      const listName = `${opPascal}ListResponse`;
      const usesList = collectRefs(op.responses).some((r) =>
        /GenericListResponse$/.test(r),
      );
      const usesData = collectRefs(op.responses).some((r) =>
        /GenericDataResponse$/.test(r),
      );

      if (usesList) {
        if (!spec.components.schemas[listName]) {
          spec.components.schemas[listName] = listResponseSchema(resourceName);
        }
        replaceRef(
          op.responses,
          "#/components/schemas/GenericListResponse",
          `#/components/schemas/${listName}`,
        );
      }
      if (usesData) {
        // Prefer existing specialized responses
        const special = {
          getInventoryReservation: "ReservationResponse",
          extendInventoryReservation: "ReservationResponse",
          releaseInventoryReservation: "ReservationResponse",
          convertInventoryReservation: "ReservationResponse",
        };
        const target = special[op.operationId] || resName;
        if (target === resName && !spec.components.schemas[resName]) {
          // Job-like ops
          if (/Export|Job|Reprocess|UploadIntent|PackingSlip/i.test(op.operationId)) {
            spec.components.schemas[resName] = {
              $ref: "#/components/schemas/JobResponse",
            };
          } else {
            spec.components.schemas[resName] = dataResponseSchema(resourceName);
          }
        }
        replaceRef(
          op.responses,
          "#/components/schemas/GenericDataResponse",
          `#/components/schemas/${target}`,
        );
      }

      // Direct GenericResource refs inside responses (rare)
      replaceRef(
        op.responses,
        "#/components/schemas/GenericResource",
        `#/components/schemas/${resourceName}`,
      );

      changedOps += 1;
    }
  }

  // Keep Generic* schemas but mark deprecated so old refs fail inventory
  for (const name of [
    "GenericCommandRequest",
    "GenericDataResponse",
    "GenericListResponse",
    "GenericResource",
  ]) {
    if (spec.components.schemas[name]) {
      spec.components.schemas[name].deprecated = true;
      spec.components.schemas[name].description =
        (spec.components.schemas[name].description || "") +
        " DEPRECATED after W1 freeze — must not be referenced by implementable operations.";
    }
  }

  const yamlOut = stringify(spec, {
    lineWidth: 0,
    defaultKeyType: "PLAIN",
    defaultStringType: "PLAIN",
  });
  writeFileSync(SOURCE, yamlOut);
  copyFileSync(SOURCE, COPY);

  // Re-inventory
  const remaining = [];
  for (const [pathKey, item] of Object.entries(spec.paths || {})) {
    for (const [method, op] of Object.entries(item)) {
      if (!op?.operationId) continue;
      for (const r of collectRefs(op)) {
        if (genericRe.test(r)) {
          remaining.push({
            operation_id: op.operationId,
            path: pathKey,
            method: method.toUpperCase(),
            tag: (op.tags || []).join("|"),
            generic_kind: r.split("/").pop(),
            status: "open",
            notes: "",
          });
        }
      }
    }
  }

  const header = "operation_id,path,method,tag,generic_kind,status,notes";
  const csvRows = remaining.map((r) =>
    [r.operation_id, r.path, r.method, r.tag, r.generic_kind, r.status, r.notes]
      .map((c) => `"${String(c).replaceAll('"', '""')}"`)
      .join(","),
  );
  writeFileSync(
    "docs/enterprise-freeze/inventory/openapi_generic_debt.csv",
    [header, ...csvRows].join("\n") + "\n",
  );

  console.log(
    JSON.stringify(
      {
        changedOps,
        remainingGenericRefs: remaining.length,
        remainingOps: new Set(remaining.map((r) => r.operation_id)).size,
        fallbackEmptyNotes: debtClosed.length,
        schemasNow: Object.keys(spec.components.schemas).length,
      },
      null,
      2,
    ),
  );
}

main();
