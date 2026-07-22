import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FeatureFlagsProvider, useFeatureFlag } from "../registry";
import { reportFeatureFlagMismatch } from "../telemetryMismatch";

function Probe() {
  const flag = useFeatureFlag("ai_copilot");
  return <div>{flag.enabled ? "ON" : "OFF"}</div>;
}

describe("useFeatureFlag", () => {
  it("reflects the server-bootstrapped value", () => {
    render(
      <FeatureFlagsProvider flags={{ ai_copilot: { enabled: true, variant: "draft_only" } }}>
        <Probe />
      </FeatureFlagsProvider>,
    );
    expect(screen.getByText("ON")).toBeTruthy();
  });

  it("defaults to off when the server omits a known flag", () => {
    render(
      <FeatureFlagsProvider flags={{}}>
        <Probe />
      </FeatureFlagsProvider>,
    );
    expect(screen.getByText("OFF")).toBeTruthy();
  });
});

describe("reportFeatureFlagMismatch", () => {
  it("reports keys missing from the server and unknown server keys", () => {
    const events: unknown[] = [];
    const telemetry = { captureEvent: (name: string, payload?: unknown) => events.push({ name, payload }) } as never;
    reportFeatureFlagMismatch(telemetry, ["ai_copilot"], ["ai_copilot", "surprise_flag"]);
    expect(events).toEqual([
      { name: "feature_flag_mismatch", payload: { missingFromServer: [], unknownFromServer: ["surprise_flag"] } },
    ]);
  });

  it("does not report anything when both sides match", () => {
    const events: unknown[] = [];
    const telemetry = { captureEvent: (name: string, payload?: unknown) => events.push({ name, payload }) } as never;
    reportFeatureFlagMismatch(telemetry, ["ai_copilot"], ["ai_copilot"]);
    expect(events).toHaveLength(0);
  });
});
