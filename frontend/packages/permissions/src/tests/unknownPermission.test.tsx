import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PermissionsProvider, usePermission } from "../registry";
import type { PermissionKey } from "../generated/permissionKeys";

function Probe({ permission }: { permission: PermissionKey }) {
  const allowed = usePermission(permission);
  return <div>{allowed ? "ALLOWED" : "DENIED"}</div>;
}

describe("usePermission", () => {
  it("grants a permission present in the session's permission list", () => {
    render(
      <PermissionsProvider permissions={["tenant.read"]}>
        <Probe permission="tenant.read" />
      </PermissionsProvider>,
    );
    expect(screen.getByText("ALLOWED")).toBeTruthy();
  });

  it("denies (never throws) a permission absent from the session's list", () => {
    render(
      <PermissionsProvider permissions={["tenant.read"]}>
        <Probe permission="tenant.update" />
      </PermissionsProvider>,
    );
    expect(screen.getByText("DENIED")).toBeTruthy();
  });

  it("denies (never throws, never defaults to allowed) with no provider at all", () => {
    render(<Probe permission="tenant.read" />);
    expect(screen.getByText("DENIED")).toBeTruthy();
  });
});
