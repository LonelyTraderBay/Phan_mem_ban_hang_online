import { z } from "zod";

/**
 * Matches the real `EventEnvelope` schema from contracts/asyncapi/tenant-events.yaml (CloudEvents-
 * shaped) — NOT the illustrative example in spec section 12.2, which uses different field names
 * (`schema_version`, `aggregate_id`, `aggregate_version`, `sequence`, `payload`). Per spec section
 * 28's own rule, the real AsyncAPI contract is the source of truth; the spec's illustrative
 * envelope is not to be copied as-is. Confirm against the live `/realtime/stream` wire format
 * before treating this as final — the OpenAPI operation only declares `text/event-stream` with
 * no further schema, so this internal-bus envelope shape is the best available source today.
 */
export const eventEnvelopeSchema = z.object({
  specversion: z.literal("1.0"),
  id: z.string(),
  source: z.string(),
  type: z.string(),
  subject: z.string().nullable().optional(),
  time: z.string(),
  datacontenttype: z.literal("application/json"),
  dataschema: z.string().nullable().optional(),
  tenantid: z.string(),
  correlationid: z.string(),
  causationid: z.string().nullable().optional(),
  partitionkey: z.string().nullable().optional(),
  actor: z
    .object({
      type: z.enum(["user", "service", "ai", "system", "support"]),
      id: z.string().optional(),
    })
    .optional(),
  data: z.record(z.string(), z.unknown()),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

export function parseEventEnvelope(raw: string): EventEnvelope | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = eventEnvelopeSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/**
 * Dedupe by envelope `id` (spec 12.2: "Event có thể duplicate; client phải idempotent") over a
 * bounded recent-id window, so memory does not grow unbounded on a long-lived connection.
 */
export function createEventDeduper(maxSize = 500) {
  const seen = new Set<string>();
  const order: string[] = [];

  return {
    isDuplicate(id: string): boolean {
      if (seen.has(id)) return true;
      seen.add(id);
      order.push(id);
      if (order.length > maxSize) {
        const oldest = order.shift();
        if (oldest !== undefined) seen.delete(oldest);
      }
      return false;
    },
  };
}
