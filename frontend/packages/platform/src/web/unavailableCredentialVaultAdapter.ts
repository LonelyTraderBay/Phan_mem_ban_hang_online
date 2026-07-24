import type { CredentialVaultAdapter } from "../adapters";

/**
 * Explicit fail-closed vault for surfaces without a native OS secret store (Vite/browser).
 * Windows Tauri must supply a real CredentialVaultAdapter (ADR-FE-014) — do not store secrets here.
 */
export function createUnavailableCredentialVaultAdapter(
  reason = "Credential vault is unavailable on this runtime.",
): CredentialVaultAdapter {
  return {
    async store() {
      throw new Error(reason);
    },
    async retrieve() {
      return null;
    },
    async remove() {
      throw new Error(reason);
    },
  };
}
