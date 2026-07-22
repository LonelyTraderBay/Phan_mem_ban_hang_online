import { describe, expect, it } from "vitest";
import { loadRuntimeConfig } from "../loadRuntimeConfig";

const validConfig = {
  environment: "staging",
  apiBaseUrl: "/api",
  sseUrl: "/events",
  oidcClientId: "web-admin",
  releaseVersion: "2.4.0",
  buildSha: "abc1234",
  telemetryEnabled: true,
  supportUrl: "/help",
};

function fakeFetch(response: Response): typeof fetch {
  return (async () => response) as unknown as typeof fetch;
}

describe("loadRuntimeConfig", () => {
  it("returns ok:true for a valid config", async () => {
    const response = new Response(JSON.stringify(validConfig), { status: 200 });
    const result = await loadRuntimeConfig(fakeFetch(response));
    expect(result).toEqual({ ok: true, config: validConfig });
  });

  it("returns ok:false without throwing for a non-2xx response", async () => {
    const response = new Response("not found", { status: 404 });
    const result = await loadRuntimeConfig(fakeFetch(response));
    expect(result.ok).toBe(false);
  });

  it("returns ok:false without throwing for a schema violation", async () => {
    const response = new Response(JSON.stringify({ ...validConfig, environment: "not-a-real-env" }), {
      status: 200,
    });
    const result = await loadRuntimeConfig(fakeFetch(response));
    expect(result.ok).toBe(false);
  });

  it("returns ok:false without throwing on invalid JSON", async () => {
    const response = new Response("not json", { status: 200 });
    const result = await loadRuntimeConfig(fakeFetch(response));
    expect(result.ok).toBe(false);
  });
});
