import type { Meta, StoryObj } from "@storybook/react";
import { TextLink } from "./TextLink";

const meta: Meta<typeof TextLink> = {
  title: "Primitives/TextLink",
  component: TextLink,
};
export default meta;

type Story = StoryObj<typeof TextLink>;

export const Default: Story = { args: { children: "Quên mật khẩu?", href: "#" } };
export const Muted: Story = { args: { children: "Tìm hiểu thêm", href: "#", muted: true } };
