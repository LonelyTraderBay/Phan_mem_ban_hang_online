#!/usr/bin/env node
import fs from "node:fs";
import YAML from "yaml";

const p = "packages/contracts-http/openapi.yaml";
const doc = YAML.parse(fs.readFileSync(p, "utf8"));

doc.paths["/tenants"] = {
  post: {
    tags: ["Tenant"],
    summary: "Provision tenant with default roles and owner invitation",
    operationId: "provisionTenant",
    description:
      "Creates a tenant, clones system role templates to tenant-scoped roles, and issues a pending owner invitation. Idempotent via Idempotency-Key. Authenticated session gate (x-permission: authenticated).",
    "x-permission": "authenticated",
    "x-idempotency": "required",
    "x-audit-action": "tenant.provision",
    "x-csrf-protection": "cookie-session-required",
    parameters: [
      { $ref: "#/components/parameters/RequestId" },
      { $ref: "#/components/parameters/CorrelationId" },
      { $ref: "#/components/parameters/IdempotencyKey" },
      { $ref: "#/components/parameters/CsrfToken" },
    ],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/ProvisionTenantRequest" },
        },
      },
    },
    responses: {
      "201": {
        description: "Tenant provisioned",
        headers: {
          "X-Request-Id": { $ref: "#/components/headers/XRequestId" },
          "X-Correlation-Id": { $ref: "#/components/headers/XCorrelationId" },
        },
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ProvisionTenantResponse" },
          },
        },
      },
      "400": { $ref: "#/components/responses/BadRequest" },
      "401": { $ref: "#/components/responses/Unauthorized" },
      "403": { $ref: "#/components/responses/Forbidden" },
      "409": { $ref: "#/components/responses/Conflict" },
      "422": { $ref: "#/components/responses/Unprocessable" },
      "429": { $ref: "#/components/responses/TooManyRequests" },
      "500": { $ref: "#/components/responses/ServerError" },
      "503": { $ref: "#/components/responses/ServiceUnavailable" },
    },
  },
};

const ordered = {};
for (const [k, v] of Object.entries(doc.paths)) {
  if (k === "/tenants/current") {
    ordered["/tenants"] = doc.paths["/tenants"];
  }
  if (k === "/tenants") continue;
  ordered[k] = v;
}
doc.paths = ordered;

doc.components.schemas.ProvisionTenantRequest = {
  type: "object",
  additionalProperties: false,
  required: ["code", "name", "owner_email"],
  properties: {
    code: {
      type: "string",
      minLength: 2,
      maxLength: 100,
      pattern: "^[a-z0-9]([a-z0-9-]{0,98}[a-z0-9])?$",
      description: "Immutable public slug (citext).",
    },
    name: { type: "string", minLength: 1, maxLength: 200 },
    owner_email: { type: "string", format: "email", maxLength: 320 },
    timezone: { type: ["string", "null"], maxLength: 64 },
    currency: { type: ["string", "null"], minLength: 3, maxLength: 3 },
    locale: { type: ["string", "null"], maxLength: 35 },
    plan_id: {
      type: ["string", "null"],
      enum: ["plan_free", "plan_pro", "plan_business", null],
      description: "HO_DEFAULTS_v1; default plan_free",
    },
  },
  description: "Request body for provisionTenant (BE-IDN-002).",
};

doc.components.schemas.ProvisionTenantData = {
  type: "object",
  additionalProperties: false,
  required: ["tenant", "owner_invitation_id", "invite_token", "default_role_ids"],
  properties: {
    tenant: { $ref: "#/components/schemas/TenantResource" },
    owner_invitation_id: { type: "string", format: "uuid" },
    invite_token: {
      type: "string",
      minLength: 16,
      maxLength: 128,
      description: "Opaque token returned once; only hash stored.",
    },
    default_role_ids: {
      type: "object",
      additionalProperties: false,
      required: ["owner", "admin", "staff", "readonly"],
      properties: {
        owner: { type: "string", format: "uuid" },
        admin: { type: "string", format: "uuid" },
        staff: { type: "string", format: "uuid" },
        readonly: { type: "string", format: "uuid" },
      },
    },
  },
};

doc.components.schemas.ProvisionTenantResponse = {
  type: "object",
  additionalProperties: false,
  required: ["data", "meta"],
  properties: {
    data: { $ref: "#/components/schemas/ProvisionTenantData" },
    meta: { $ref: "#/components/schemas/Meta" },
  },
};

fs.writeFileSync(p, YAML.stringify(doc, { lineWidth: 120 }));
fs.copyFileSync(p, "backend_doc/contracts/openapi.yaml");
console.log("provisionTenant added");
