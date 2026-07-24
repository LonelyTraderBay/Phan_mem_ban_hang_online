import type { ReactNode } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { AppIntlProvider, type SupportedLocale } from "@ai-sales/i18n";
import { PermissionsProvider } from "@ai-sales/permissions";
import { ToastProvider } from "@ai-sales/ui";
import type { TelemetryAdapter } from "@ai-sales/telemetry";
import type { ApiClient } from "@ai-sales/api-client";
import { RootErrorBoundary } from "./RootErrorBoundary";
import { ApiClientProvider, TenantScopeProvider } from "./ApiClientContext";

interface AppProvidersProps {
  queryClient: QueryClient;
  telemetry: TelemetryAdapter;
  apiClient: ApiClient;
  tenantScope: string;
  locale: SupportedLocale;
  permissions: string[];
  children: ReactNode;
}

export function AppProviders({
  queryClient,
  telemetry,
  apiClient,
  tenantScope,
  locale,
  permissions,
  children,
}: AppProvidersProps) {
  return (
    <RootErrorBoundary telemetry={telemetry}>
      <AppIntlProvider locale={locale}>
        <QueryClientProvider client={queryClient}>
          <ApiClientProvider apiClient={apiClient}>
            <TenantScopeProvider tenantId={tenantScope}>
              <PermissionsProvider permissions={permissions}>
                <ToastProvider>{children}</ToastProvider>
              </PermissionsProvider>
            </TenantScopeProvider>
          </ApiClientProvider>
        </QueryClientProvider>
      </AppIntlProvider>
    </RootErrorBoundary>
  );
}
