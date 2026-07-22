export type {
  StorageAdapter,
  NotificationAdapter,
  PrintAdapter,
  DeepLinkAdapter,
  CredentialVaultAdapter,
} from "./adapters";

export { createWebStorageAdapter } from "./web/webStorageAdapter";
export { createWebNotificationAdapter } from "./web/webNotificationAdapter";
export { createWebDeepLinkAdapter } from "./web/webDeepLinkAdapter";
