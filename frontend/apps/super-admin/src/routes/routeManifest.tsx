import { lazy, Suspense } from "react";
import type { RouteObject } from "react-router";
import { Skeleton } from "@ai-sales/ui";
import RouteChunkErrorBoundary from "./RouteChunkErrorBoundary";

const HomePlaceholder = lazy(() => import("./HomePlaceholder"));
const NotFoundRoute = lazy(() => import("./NotFoundRoute"));

function withSuspense(Element: React.LazyExoticComponent<() => React.JSX.Element>) {
  return (
    <Suspense fallback={<Skeleton width="100%" height="60vh" aria-label="Đang tải trang" />}>
      <Element />
    </Suspense>
  );
}

export const routeManifest: RouteObject[] = [
  {
    path: "/",
    element: withSuspense(HomePlaceholder),
    errorElement: <RouteChunkErrorBoundary />,
  },
  {
    path: "*",
    element: withSuspense(NotFoundRoute),
    errorElement: <RouteChunkErrorBoundary />,
  },
];
