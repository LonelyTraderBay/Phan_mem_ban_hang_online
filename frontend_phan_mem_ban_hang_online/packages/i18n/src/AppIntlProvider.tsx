import { IntlProvider } from "react-intl";
import type { ReactNode } from "react";
import viVN from "./locales/vi-VN.json";
import enUS from "./locales/en-US.json";

export const SUPPORTED_LOCALES = ["vi-VN", "en-US"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

// vi-VN is the baseline locale (spec 5.1).
export const DEFAULT_LOCALE: SupportedLocale = "vi-VN";

const catalogs: Record<SupportedLocale, Record<string, string>> = {
  "vi-VN": viVN,
  "en-US": enUS,
};

interface AppIntlProviderProps {
  locale: SupportedLocale;
  children: ReactNode;
}

export function AppIntlProvider({ locale, children }: AppIntlProviderProps) {
  return (
    <IntlProvider locale={locale} messages={catalogs[locale]} defaultLocale={DEFAULT_LOCALE}>
      {children}
    </IntlProvider>
  );
}
