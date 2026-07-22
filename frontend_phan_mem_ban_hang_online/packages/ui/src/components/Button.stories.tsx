import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";

const meta: Meta<typeof Button> = {
  title: "Primitives/Button",
  component: Button,
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = { args: { children: "Xác nhận", variant: "primary" } };
export const Secondary: Story = { args: { children: "Hủy", variant: "secondary" } };
export const Danger: Story = { args: { children: "Xóa", variant: "danger" } };
export const Disabled: Story = { args: { children: "Xác nhận", disabled: true } };
export const LongLabel: Story = {
  args: { children: "Một nhãn nút rất dài để kiểm tra tràn chữ trên các màn hình nhỏ" },
};
