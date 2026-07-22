import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "./Input";

const meta: Meta<typeof Input> = {
  title: "Primitives/Input",
  component: Input,
};
export default meta;

type Story = StoryObj<typeof Input>;

export const Default: Story = { args: { placeholder: "Nhập số điện thoại" } };
export const Invalid: Story = { args: { placeholder: "Nhập số điện thoại", invalid: true } };
export const Disabled: Story = { args: { placeholder: "Nhập số điện thoại", disabled: true } };
