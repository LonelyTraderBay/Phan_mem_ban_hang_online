import type { ReactNode } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { AppIntlProvider, type SupportedLocale } from "@ai-sales/i18n";
import { PermissionsProvider } from "@ai-sales/permissions";
import { ToastProvider } from "@ai-sales/ui";
import type { TelemetryAdapter } from "@ai-sales/telemetry";
import { RootErrorBoundary } from "./RootErrorBoundary";

interface AppProvidersProps {
  queryClient: QueryClient;
  telemetry: TelemetryAdapter;
  locale: SupportedLocale;
  permissions: string[];
  children: ReactNode;
}

// No FeatureFlagsProvider here: no flag in contracts/feature-flags.yaml is scoped to
// `super-admin` today (ADR-FE-004 — this app's origin/session/blast-radius stays separate).
export function AppProviders({ queryClient, telemetry, locale, permissions, children }: AppProvidersProps) {
  return (
    <RootErrorBoundary telemetry={telemetry}>
      <AppIntlProvider locale={locale}>
        <QueryClientProvider client={queryClient}>
          <PermissionsProvider permissions={permissions}>
            <ToastProvider>{children}</ToastProvider>
          </PermissionsProvider>
        </QueryClientProvider>
      </AppIntlProvider>
    </RootErrorBoundary>
  );
}
