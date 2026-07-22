import type { StorageAdapter } from "../adapters";

export function createWebStorageAdapter(storage: Storage = window.localStorage): StorageAdapter {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
    clear: () => storage.clear(),
  };
}
