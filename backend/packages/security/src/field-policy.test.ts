import { describe, expect, it } from "vitest";
import {
  applyFieldPolicies,
  assertCanReadField,
  FieldAuthorizationError,
  redactSecretsDeep
} from "./field-policy.js";

describe("BE-IDN-012 field-level auth", () => {
  const product = {
    id: "p1",
    name: "Widget",
    unit_price_minor: 10000,
    cost_minor: 4000,
    profit_minor: 6000
  };

  it("omits cost fields without catalog.cost.read", () => {
    const masked = applyFieldPolicies(product, ["catalog.read"]);
    expect(masked).toEqual({
      id: "p1",
      name: "Widget",
      unit_price_minor: 10000
    });
    expect("cost_minor" in masked).toBe(false);
  });

  it("keeps cost fields with catalog.cost.read", () => {
    const full = applyFieldPolicies(product, ["catalog.read", "catalog.cost.read"]);
    expect(full.cost_minor).toBe(4000);
    expect(full.profit_minor).toBe(6000);
  });

  it("omits PII without customer.pii.read", () => {
    const customer = {
      id: "c1",
      display_name: "Ada",
      primary_email: "ada@example.com",
      primary_phone: "+84901234567"
    };
    const masked = applyFieldPolicies(customer, ["customer.read"]);
    expect(masked).toEqual({ id: "c1", display_name: "Ada" });
  });

  it("IDOR: assertCanReadField throws without permission", () => {
    expect(() =>
      assertCanReadField({ permissions: ["customer.read"] }, "primary_email")
    ).toThrow(FieldAuthorizationError);
    expect(() =>
      assertCanReadField({ permissions: ["customer.pii.read"] }, "primary_email")
    ).not.toThrow();
  });

  it("redacts secrets deeply for export/logs", () => {
    const payload = {
      action: "auth.login",
      password_hash: "argon2...",
      nested: { refresh_token: "secret", ok: true }
    };
    expect(redactSecretsDeep(payload)).toEqual({
      action: "auth.login",
      password_hash: "[redacted]",
      nested: { refresh_token: "[redacted]", ok: true }
    });
  });
});
