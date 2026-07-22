/**
 * Platform-specific code (browser vs Tauri/Windows) must only be reached through these
 * adapter interfaces (spec 3.4) — features and packages/ui depend on the interface, never
 * on `window`/`navigator`/`@tauri-apps/*` directly.
 */

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

export interface NotificationAdapter {
  notify(input: { title: string; body?: string }): void;
  requestPermission(): Promise<"granted" | "denied" | "default">;
}

export interface PrintAdapter {
  printPdf(url: string): Promise<void>;
}

export interface DeepLinkAdapter {
  openExternal(url: string): Promise<void>;
  onDeepLink(handler: (url: string) => void): () => void;
}

export interface CredentialVaultAdapter {
  store(key: string, value: string): Promise<void>;
  retrieve(key: string): Promise<string | null>;
  remove(key: string): Promise<void>;
}
