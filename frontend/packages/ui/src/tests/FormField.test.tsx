import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FormField } from "../components/FormField";
import { Input } from "../components/Input";

describe("FormField", () => {
  it("associates the label with the control via a shared id", () => {
    render(
      <FormField label="Số điện thoại">
        <Input />
      </FormField>,
    );
    const input = screen.getByLabelText("Số điện thoại");
    expect(input).toBeTruthy();
  });

  it("marks the control invalid and exposes the error via role=alert", () => {
    render(
      <FormField label="Số điện thoại" error="Số điện thoại không hợp lệ.">
        <Input />
      </FormField>,
    );
    expect(screen.getByRole("alert").textContent).toBe("Số điện thoại không hợp lệ.");
    expect(screen.getByLabelText("Số điện thoại").getAttribute("aria-invalid")).toBe("true");
  });
});
