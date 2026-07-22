import type { Preview } from "@storybook/react";
import { useEffect } from "react";
import { buildCssVariables } from "@ai-sales/design-tokens";

function TokenStyleInjector({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const styleTag = document.createElement("style");
    styleTag.textContent = buildCssVariables();
    document.head.appendChild(styleTag);
    return () => {
      document.head.removeChild(styleTag);
    };
  }, []);
  return children;
}

const preview: Preview = {
  decorators: [
    (Story) => (
      <TokenStyleInjector>
        <Story />
      </TokenStyleInjector>
    ),
  ],
  parameters: {
    controls: { expanded: true },
  },
};

export default preview;
