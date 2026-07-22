import { createContext, useContext, type ReactNode } from "react";
import type { PermissionKey } from "./generated/permissionKeys";

const PermissionsContext = createContext<Set<string> | null>(null);

interface PermissionsProviderProps {
  permissions: string[];
  children: ReactNode;
}

/**
 * Provides the session's granted permission set. Permissions always come from the session
 * bootstrap payload as specific permission strings, never a single role name (spec 9.3/10.1).
 */
export function PermissionsProvider({ permissions, children }: PermissionsProviderProps) {
  return <PermissionsContext.Provider value={new Set(permissions)}>{children}</PermissionsContext.Provider>;
}

/**
 * An unrecognized/stale permission key always resolves to denied — never throws, never
 * defaults to allowed (FE-F00-007 step 4).
 */
export function usePermission(key: PermissionKey): boolean {
  const granted = useContext(PermissionsContext);
  if (!granted) return false;
  return granted.has(key);
}
