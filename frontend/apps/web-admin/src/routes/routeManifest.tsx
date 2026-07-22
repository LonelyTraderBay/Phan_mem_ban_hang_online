import { lazy, Suspense, type ReactNode } from "react";
import { Navigate, type RouteObject } from "react-router";
import { RequireAuth } from "@ai-sales/auth";
import { Skeleton } from "@ai-sales/ui";
import { useAuth } from "../app/AuthProvider";
import RouteChunkErrorBoundary from "./RouteChunkErrorBoundary";

const HomePlaceholder = lazy(() => import("./HomePlaceholder"));
const NotFoundRoute = lazy(() => import("./NotFoundRoute"));
const AuthPlaceholder = lazy(() => import("./AuthPlaceholder"));
const ProductCatalogRoute = lazy(() => import("../features/product-catalog/routes/ProductCatalogRoute"));

function withSuspense(Element: React.LazyExoticComponent<() => React.JSX.Element>) {
  return (
    <Suspense fallback={<Skeleton width="100%" height="60vh" aria-label="Đang tải trang" />}>
      <Element />
    </Suspense>
  );
}

// Anonymous users redirect to /login. RequireAuth is router-agnostic (package rule); Navigate
// wiring lives here. 403 never triggers refresh — that rule is in @ai-sales/auth's refresh helper.
function Protected({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  return (
    <RequireAuth status={status} fallback={<Navigate to="/login" replace />}>
      {children}
    </RequireAuth>
  );
}

export const routeManifest: RouteObject[] = [
  {
    path: "/",
    element: <Protected>{withSuspense(HomePlaceholder)}</Protected>,
    errorElement: <RouteChunkErrorBoundary />,
  },
  {
    path: "/products",
    element: <Protected>{withSuspense(ProductCatalogRoute)}</Protected>,
    errorElement: <RouteChunkErrorBoundary />,
  },
  {
    path: "/login",
    element: withSuspense(AuthPlaceholder),
    errorElement: <RouteChunkErrorBoundary />,
  },
  {
    path: "/auth/callback",
    element: withSuspense(AuthPlaceholder),
    errorElement: <RouteChunkErrorBoundary />,
  },
  {
    path: "/2fa",
    element: withSuspense(AuthPlaceholder),
    errorElement: <RouteChunkErrorBoundary />,
  },
  {
    path: "/forgot-password",
    element: withSuspense(AuthPlaceholder),
    errorElement: <RouteChunkErrorBoundary />,
  },
  {
    path: "/reset-password",
    element: withSuspense(AuthPlaceholder),
    errorElement: <RouteChunkErrorBoundary />,
  },
  {
    path: "/accept-invite",
    element: withSuspense(AuthPlaceholder),
    errorElement: <RouteChunkErrorBoundary />,
  },
  {
    path: "*",
    element: withSuspense(NotFoundRoute),
    errorElement: <RouteChunkErrorBoundary />,
  },
];
