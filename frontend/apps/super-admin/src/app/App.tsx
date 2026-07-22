import { useEffect, useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import type { RuntimeConfig } from "@ai-sales/config";
import { createApiClient } from "@ai-sales/api-client";
import { createQueryClient } from "@ai-sales/state";
import { createConsoleAdapter } from "@ai-sales/telemetry";
import { bootstrapSession, type SessionBootstrap } from "@ai-sales/auth";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type SupportedLocale } from "@ai-sales/i18n";
import { Skeleton } from "@ai-sales/ui";
import { AppProviders } from "./providers";
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

export function App({ config }: AppProps) {
  const [telemetry] = useState(() => createConsoleAdapter());
  const [apiClient] = useState(() => createApiClient({ config, telemetry }));
  const [queryClient] = useState(() => createQueryClient(config.environment));
  const [session, setSession] = useState<SessionBootstrap | null>(null);
  const [status, setStatus] = useState<"bootstrapping" | "anonymous" | "authenticated">("bootstrapping");

  useEffect(() => {
    let cancelled = false;
    void bootstrapSession(apiClient).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setSession(result.session);
        setStatus("authenticated");
      } else {
        setStatus("anonymous");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  if (status === "bootstrapping") {
    return <Skeleton width="100%" height="100vh" aria-label="Đang tải ứng dụng" />;
  }

  return (
    <AppProviders
      queryClient={queryClient}
      telemetry={telemetry}
      locale={resolveLocale(session?.user.locale)}
      permissions={session?.permissions ?? []}
    >
      <RouterProvider router={router} />
    </AppProviders>
  );
}
