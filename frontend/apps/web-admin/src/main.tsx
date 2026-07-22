import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { loadRuntimeConfig } from "@ai-sales/config";
import { FatalConfigurationScreen } from "./app/FatalConfigurationScreen";
import { App } from "./app/App";

async function bootstrap(): Promise<void> {
  const rootElement = document.getElementById("root");
  if (!rootElement) throw new Error("Missing #root element");
  const root = createRoot(rootElement);

  const configResult = await loadRuntimeConfig();
  if (!configResult.ok) {
    root.render(<FatalConfigurationScreen error={configResult.error} />);
    return;
  }

  root.render(
    <StrictMode>
      <App config={configResult.config} />
    </StrictMode>,
  );
}

void bootstrap();
