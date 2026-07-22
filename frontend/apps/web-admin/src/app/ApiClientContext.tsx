import { createContext, useContext, type ReactNode } from "react";
import type { ApiClient } from "@ai-sales/api-client";

const ApiClientContext = createContext<ApiClient | null>(null);

export function ApiClientProvider({ apiClient, children }: { apiClient: ApiClient; children: ReactNode }) {
  return <ApiClientContext.Provider value={apiClient}>{children}</ApiClientContext.Provider>;
}

export function useApiClient(): ApiClient {
  const client = useContext(ApiClientContext);
  if (!client) throw new Error("useApiClient() must be used within <ApiClientProvider>");
  return client;
}

const TenantScopeContext = createContext<string>("anonymous");

export function TenantScopeProvider({ tenantId, children }: { tenantId: string; children: ReactNode }) {
  return <TenantScopeContext.Provider value={tenantId}>{children}</TenantScopeContext.Provider>;
}

export function useTenantScope(): string {
  return useContext(TenantScopeContext);
}
