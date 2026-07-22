/**
 * Idempotency-Key management for the actions listed in spec 11.7 (send message, create/confirm/
 * cancel order, payment, shipment, inventory adjustment, import commit, AI suggestion send).
 *
 * The client generates a UUID when the user starts a logical action and keeps the same key for
 * retries of that action; a new key is generated only when the payload changes or the user
 * starts a new action (spec 11.7).
 */

export interface IdempotencyKeyStore {
  getOrCreate(actionId: string): string;
  reset(actionId: string): void;
}

export function createIdempotencyKeyStore(
  uuid: () => string = () => crypto.randomUUID(),
): IdempotencyKeyStore {
  const keys = new Map<string, string>();
  return {
    getOrCreate(actionId) {
      let key = keys.get(actionId);
      if (!key) {
        key = uuid();
        keys.set(actionId, key);
      }
      return key;
    },
    reset(actionId) {
      keys.delete(actionId);
    },
  };
}
