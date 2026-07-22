import { describe, expect, it } from "vitest";
import { toCatalogItem } from "../api/products.mapper";

describe("toCatalogItem", () => {
  it("maps the known GenericResource fields and keeps the rest as raw", () => {
    const result = toCatalogItem({
      id: "prod_1",
      version: 3,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-02-01T00:00:00Z",
      some_future_field: "value",
    } as never);

    expect(result).toEqual({
      id: "prod_1",
      version: 3,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-02-01T00:00:00Z",
      raw: { some_future_field: "value" },
    });
  });

  it("omits optional fields entirely when absent, rather than setting them to undefined", () => {
    const result = toCatalogItem({ id: "prod_2" } as never);
    expect(result).toEqual({ id: "prod_2", raw: {} });
    expect("version" in result).toBe(false);
  });
});
