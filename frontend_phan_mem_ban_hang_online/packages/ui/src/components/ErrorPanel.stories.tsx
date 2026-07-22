import type { Meta, StoryObj } from "@storybook/react";
import { ErrorPanel } from "./ErrorPanel";

const meta: Meta<typeof ErrorPanel> = {
  title: "Primitives/ErrorPanel",
  component: ErrorPanel,
};
export default meta;

type Story = StoryObj<typeof ErrorPanel>;

export const Basic: Story = { args: { title: "Không thể tải dữ liệu" } };
export const WithDetailAndMeta: Story = {
  args: {
    title: "Đơn hàng đã được người khác cập nhật.",
    detail: "Vui lòng tải lại phiên bản mới nhất.",
    code: "ORDER_VERSION_CONFLICT",
    requestId: "req_abc123",
  },
};
export const Retryable: Story = {
  args: { title: "Mất kết nối mạng", retryable: true, onRetry: () => {} },
};
