import { describe, expect, it } from "vitest";
import { handlers } from "../msw/handlers";
import { authHandlers } from "../msw/authHandlers";
import { handlerDescriptors } from "../msw/generated/handlerDescriptors";
import { buildGenericResource } from "../factories/genericResource";
import { buildSessionBootstrap } from "../factories/sessionBootstrap";

describe("generated MSW handlers", () => {
  it("produces one handler per descriptor plus the hand-written auth overrides", () => {
    expect(handlers).toHaveLength(handlerDescriptors.length + authHandlers.length);
  });

  it("lists the hand-written auth overrides before the generated stubs (MSW first-match wins)", () => {
    expect(handlers.slice(0, authHandlers.length)).toEqual(authHandlers);
  });

  it("covers GET /me via hand-written auth overrides and GET /products via generated stubs", () => {
    // GET /me uses SessionBootstrapResponse — generator skips it; authHandlers owns it.
    expect(authHandlers.length).toBeGreaterThan(0);
    const paths = handlerDescriptors.map((d) => `${d.method.toUpperCase()} ${d.path}`);
    expect(paths).not.toContain("GET /me");
    expect(paths).toContain("GET /products");
  });
});

describe("factories", () => {
  it("buildGenericResource returns a schema-shaped, non-colliding fixture", () => {
    const a = buildGenericResource();
    const b = buildGenericResource();
    expect(a.id).not.toBe(b.id);
    expect(a).toHaveProperty("version");
    expect(a).toHaveProperty("created_at");
  });

  it("buildSessionBootstrap returns the spec 9.3 shape", () => {
    const session = buildSessionBootstrap({ permissions: ["catalog.read"] });
    expect(session.permissions).toEqual(["catalog.read"]);
    expect(session.tenant.currency).toBe("VND");
  });
});
