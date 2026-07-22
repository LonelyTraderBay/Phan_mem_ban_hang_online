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
  apiClient,
}: {
  config: RuntimeConfig;
  apiClient: ReturnType<typeof createApiClient>;
}) {
  const { session } = useAuth();
  const [telemetry] = useState(() => createConsoleAdapter());
  const [queryClient] = useState(() => createQueryClient(config.environment));

  return (
    <AppProviders
      queryClient={queryClient}
      telemetry={telemetry}
      apiClient={apiClient}
      tenantScope={session?.tenant.id ?? "anonymous"}
      locale={resolveLocale(session?.user.locale)}
      permissions={session?.permissions ?? []}
      featureFlags={session?.feature_flags ?? {}}
    >
      <RouterProvider router={router} />
    </AppProviders>
  );
}

export function App({ config }: AppProps) {
  const telemetry = useMemo(() => createConsoleAdapter(), []);
  const apiClient = useMemo(() => createApiClient({ config, telemetry }), [config, telemetry]);

  return (
    <AuthProvider
      apiClient={apiClient}
      fallback={<Skeleton width="100%" height="100vh" aria-label="Đang tải ứng dụng" />}
    >
      <AppShell config={config} apiClient={apiClient} />
    </AuthProvider>
  );
}
