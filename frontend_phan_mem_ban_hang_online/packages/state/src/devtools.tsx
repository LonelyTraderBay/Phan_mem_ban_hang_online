import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import type { Environment } from "@ai-sales/config";

interface QueryDevtoolsProps {
  environment: Environment;
}

// Devtools only render outside production/pilot (FE-F00-005 step 5).
export function QueryDevtools({ environment }: QueryDevtoolsProps) {
  if (environment === "production" || environment === "pilot") return null;
  return <ReactQueryDevtools initialIsOpen={false} />;
}
