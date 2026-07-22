import type { Meta, StoryObj } from "@storybook/react";
import { FormField } from "./FormField";
import { Input } from "./Input";

const meta: Meta<typeof FormField> = {
  title: "Primitives/FormField",
  component: FormField,
};
export default meta;

type Story = StoryObj<typeof FormField>;

export const Default: Story = {
  args: { label: "Số điện thoại", children: <Input placeholder="0912345678" /> },
};
export const WithHint: Story = {
  args: { label: "Số điện thoại", hint: "Định dạng: 10 chữ số", children: <Input /> },
};
export const WithError: Story = {
  args: { label: "Số điện thoại", error: "Số điện thoại không hợp lệ.", children: <Input invalid /> },
};
