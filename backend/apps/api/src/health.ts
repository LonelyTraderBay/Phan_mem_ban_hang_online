export interface HealthPayload {
  readonly service: string;
  readonly status: "ok";
  readonly timestamp: string;
}

export function buildHealthPayload(service: string, now = new Date()): HealthPayload {
  return {
    service,
    status: "ok",
    timestamp: now.toISOString()
  };
}
