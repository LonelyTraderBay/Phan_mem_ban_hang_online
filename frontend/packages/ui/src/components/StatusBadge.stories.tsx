import type { Meta, StoryObj } from "@storybook/react";
import { StatusBadge } from "./StatusBadge";

const meta: Meta<typeof StatusBadge> = {
  title: "Primitives/StatusBadge",
  component: StatusBadge,
};
export default meta;

type Story = StoryObj<typeof StatusBadge>;

export const Success: Story = { args: { label: "Đã xác nhận", tone: "success" } };
export const Warning: Story = { args: { label: "Chờ xử lý", tone: "warning" } };
export const Danger: Story = { args: { label: "Đã hủy", tone: "danger" } };
export const Neutral: Story = { args: { label: "Nháp", tone: "neutral" } };
