import type { Meta, StoryObj } from "@storybook/react";
import { AuthLayout } from "./AuthLayout";
import { Button } from "./Button";
import { TextLink } from "./TextLink";

const meta: Meta<typeof AuthLayout> = {
  title: "Layout/AuthLayout",
  component: AuthLayout,
};
export default meta;

type Story = StoryObj<typeof AuthLayout>;

export const Default: Story = {
  args: {
    title: "Đăng nhập để tiếp tục",
    description: "Một câu hỗ trợ ngắn. Phiên dùng cookie bảo mật (HttpOnly).",
    children: <Button variant="primary" style={{ width: "100%" }}>Tiếp tục với IdP</Button>,
    footer: (
      <>
        <TextLink href="/forgot-password">Quên mật khẩu?</TextLink>
        {" · "}
        <TextLink href="/accept-invite">Chấp nhận lời mời</TextLink>
      </>
    ),
  },
};
