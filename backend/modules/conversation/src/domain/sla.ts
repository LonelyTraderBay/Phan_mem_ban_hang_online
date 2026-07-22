/**
 * BE-CON-007 — SLA calendar/calculation/breach scheduler stub.
 */

export interface SlaCalendarDay {
  readonly weekday: number;
  readonly startHour: number;
  readonly endHour: number;
}

const DEFAULT_BUSINESS_HOURS: readonly SlaCalendarDay[] = [
  { weekday: 1, startHour: 8, endHour: 18 },
  { weekday: 2, startHour: 8, endHour: 18 },
  { weekday: 3, startHour: 8, endHour: 18 },
  { weekday: 4, startHour: 8, endHour: 18 },
  { weekday: 5, startHour: 8, endHour: 18 },
  { weekday: 6, startHour: 8, endHour: 12 }
];

export function computeSlaDueAt(options: {
  readonly startedAt: Date;
  readonly responseMinutes: number;
  readonly calendar?: readonly SlaCalendarDay[];
}): string {
  const calendar = options.calendar ?? DEFAULT_BUSINESS_HOURS;
  let remaining = options.responseMinutes;
  const cursor = new Date(options.startedAt);
  while (remaining > 0) {
    cursor.setMinutes(cursor.getMinutes() + 1);
    const day = calendar.find((d) => d.weekday === cursor.getDay());
    if (!day) continue;
    const hour = cursor.getHours();
    if (hour < day.startHour || hour >= day.endHour) continue;
    remaining -= 1;
  }
  return cursor.toISOString();
}

export function isSlaBreached(options: {
  readonly slaDueAt: string | null;
  readonly slaBreachedAt: string | null;
  readonly now?: Date;
}): boolean {
  if (options.slaBreachedAt) return true;
  if (!options.slaDueAt) return false;
  const now = options.now ?? new Date();
  return now.getTime() > new Date(options.slaDueAt).getTime();
}

export function markSlaBreachIfDue(options: {
  readonly slaDueAt: string | null;
  readonly slaBreachedAt: string | null;
  readonly now?: Date;
}): string | null {
  if (options.slaBreachedAt) return options.slaBreachedAt;
  if (isSlaBreached(options)) {
    return (options.now ?? new Date()).toISOString();
  }
  return null;
}
