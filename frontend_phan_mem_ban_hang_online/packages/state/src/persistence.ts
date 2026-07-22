import type { StorageAdapter } from "@ai-sales/platform";

export interface PersistenceScope {
  sessionId: string;
  tenantId: string;
  userId: string;
}

interface PersistedEntry<T> {
  value: T;
  storedAt: string;
  expiresAt: string;
}

/**
 * Namespaced, TTL'd persistence over a StorageAdapter (spec 13.6): every key is scoped by
 * session/tenant/user, entries expire, and this layer never stores a token. Callers remain
 * responsible for only persisting fields whose PII classification allows it (spec 13.6:
 * "ưu tiên không persist PII").
 *
 * NOTE: this wraps the synchronous StorageAdapter (localStorage-shaped) for the F00 baseline.
 * Spec 13.6 calls for IndexedDB with schema version/migration/cleanup for larger drafts —
 * revisit this adapter when a feature needs more than small key/value entries.
 */
export function createPersistenceAdapter(storage: StorageAdapter, scope: PersistenceScope) {
  const namespace = `ai-sales:${scope.sessionId}:${scope.tenantId}:${scope.userId}`;
  const key = (name: string): string => `${namespace}:${name}`;

  return {
    set<T>(name: string, value: T, ttlMs: number, now: Date): void {
      const entry: PersistedEntry<T> = {
        value,
        storedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
      };
      storage.setItem(key(name), JSON.stringify(entry));
    },
    get<T>(name: string, now: Date): T | null {
      const raw = storage.getItem(key(name));
      if (!raw) return null;
      const entry = JSON.parse(raw) as PersistedEntry<T>;
      if (new Date(entry.expiresAt).getTime() < now.getTime()) {
        storage.removeItem(key(name));
        return null;
      }
      return entry.value;
    },
    remove(name: string): void {
      storage.removeItem(key(name));
    },
    /** Call on logout/session-revoke (spec 13.6: "delete on logout/session revoke"). */
    clearAll(knownNames: string[]): void {
      for (const name of knownNames) storage.removeItem(key(name));
    },
  };
}
