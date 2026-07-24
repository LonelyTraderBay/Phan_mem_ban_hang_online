import type { Meta, StoryObj } from "@storybook/react";
import { AppFrame } from "./AppFrame";
import { Sidebar, SidebarNavItem, SidebarSection } from "./Sidebar";
import { TopBar } from "./TopBar";
import { PageHeader } from "./PageHeader";
import { ContentArea } from "./ContentArea";
import { Card } from "./Card";
import { EmptyState } from "./EmptyState";

const meta: Meta<typeof AppFrame> = {
  title: "Layout/AppFrame",
  component: AppFrame,
};
export default meta;

type Story = StoryObj<typeof AppFrame>;

export const Default: Story = {
  render: () => (
    <div style={{ height: 480, border: "1px solid #ccc" }}>
      <AppFrame
        sidebar={
          <Sidebar brand="AI Sales OS">
            <SidebarSection label="Chính">
              <SidebarNavItem label="Tổng quan" href="/" active />
              <SidebarNavItem label="Sản phẩm" href="/products" />
            </SidebarSection>
          </Sidebar>
        }
        topbar={<TopBar title="Không gian demo" meta={<span>Admin</span>} />}
      >
        <ContentArea>
          <PageHeader title="Tổng quan" description="Shell enterprise Trust & Commerce." />
          <Card>
            <EmptyState title="Chưa có dữ liệu" description="Đây là khung layout dùng chung." />
          </Card>
        </ContentArea>
      </AppFrame>
    </div>
  ),
};
