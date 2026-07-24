import { createContext, useContext, type ReactNode } from "react";
import type { RuntimeConfig } from "@ai-sales/config";

const AppConfigContext = createContext<RuntimeConfig | null>(null);

export function AppConfigProvider({ config, children }: { config: RuntimeConfig; children: ReactNode }) {
  return <AppConfigContext.Provider value={config}>{children}</AppConfigContext.Provider>;
}

export function useAppConfig(): RuntimeConfig {
  const config = useContext(AppConfigContext);
  if (!config) {
    throw new Error("useAppConfig must be used within AppConfigProvider");
  }
  return config;
}
