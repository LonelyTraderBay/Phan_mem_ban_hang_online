import type { Meta, StoryObj } from "@storybook/react";
import { Skeleton } from "./Skeleton";

const meta: Meta<typeof Skeleton> = {
  title: "Primitives/Skeleton",
  component: Skeleton,
};
export default meta;

type Story = StoryObj<typeof Skeleton>;

export const Line: Story = { args: { width: 240, height: 16, "aria-label": "Đang tải" } };
export const Block: Story = { args: { width: 240, height: 120, "aria-label": "Đang tải" } };
