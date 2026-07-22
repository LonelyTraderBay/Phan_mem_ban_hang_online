import type { DeepLinkAdapter } from "../adapters";

// Web has no OS-level deep-link surface, so onDeepLink is a no-op subscription (returns an
// unsubscribe function for interface symmetry with the desktop implementation).
export function createWebDeepLinkAdapter(): DeepLinkAdapter {
  return {
    async openExternal(url) {
      window.open(url, "_blank", "noopener,noreferrer");
    },
    onDeepLink() {
      return () => {};
    },
  };
}
