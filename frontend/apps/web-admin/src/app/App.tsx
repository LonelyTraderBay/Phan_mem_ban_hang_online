import { useMemo, useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import type { RuntimeConfig } from "@ai-sales/config";
import { createApiClient } from "@ai-sales/api-client";
import { createQueryClient } from "@ai-sales/state";
import { createConsoleAdapter } from "@ai-sales/telemetry";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type SupportedLocale } from "@ai-sales/i18n";
import { Skeleton } from "@ai-sales/ui";
import { AppProviders } from "./providers";
import { AuthProvider, useAuth } from "./AuthProvider";
import { AppConfigProvider } from "./AppConfigContext";
import { routeManifest } from "../routes/routeManifest";

interface AppProps {
  config: RuntimeConfig;
}

function resolveLocale(locale: string | undefined): SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale ?? "")
    ? (locale as SupportedLocale)
    : DEFAULT_LOCALE;
}

const router = createBrowserRouter(routeManifest);

function AppShell({
  config,
  queryClient,
  telemetry,
}: {
  config: RuntimeConfig;
  queryClient: ReturnType<typeof createQueryClient>;
  telemetry: ReturnType<typeof createConsoleAdapter>;
}) {
  const { session, authenticatedClient } = useAuth();

  return (
    <AppConfigProvider config={config}>
      <AppProviders
        queryClient={queryClient}
        telemetry={telemetry}
        apiClient={authenticatedClient}
        tenantScope={session?.tenant.id ?? "anonymous"}
        locale={resolveLocale(session?.user.locale)}
        permissions={session?.permissions ?? []}
      >
        <RouterProvider router={router} />
      </AppProviders>
    </AppConfigProvider>
  );
}

export function App({ config }: AppProps) {
  const telemetry = useMemo(() => createConsoleAdapter(), []);
  const apiClient = useMemo(() => createApiClient({ config, telemetry }), [config, telemetry]);
  const [queryClient] = useState(() => createQueryClient(config.environment));

  return (
    <AuthProvider
      apiClient={apiClient}
      queryClient={queryClient}
      fallback={<Skeleton width="100%" height="100vh" aria-label="Đang tải ứng dụng" />}
    >
      <AppShell config={config} queryClient={queryClient} telemetry={telemetry} />
    </AuthProvider>
  );
}
