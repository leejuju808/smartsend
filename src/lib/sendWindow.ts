import { DateTime } from "luxon";

export type WindowCfg = {
  timezone: string;           // IANA
  start: number;              // 0-23 inclusive
  end: number;                // 0-23 exclusive
  weekdays: number[];         // 0=Sun..6=Sat
};

function is24h(start: number, end: number) {
  return start === 0 && end === 0; // convention: 0..0 means 24h
}

/**
 * Given a desired local datetime, returns same moment if inside window,
 * else the next permitted local datetime at start hour on an allowed day.
 * Input/Output are ISO strings in UTC.
 */
export function clampToWindow(desiredUtcISO: string, w: WindowCfg): string {
  const tz = w.timezone || "UTC";
  let local = DateTime.fromISO(desiredUtcISO, { zone: "utc" }).setZone(tz);

  if (is24h(w.start, w.end)) return local.toUTC().toISO();

  const inDay = w.weekdays.includes(local.weekday % 7); // Luxon: 1=Mon..7=Sun -> mod to 0..6
  const inHour = w.start <= w.end
    ? local.hour >= w.start && local.hour < w.end
    : !(local.hour >= w.end && local.hour < w.start); // overnight window (e.g., 20→4)

  if (inDay && inHour) return local.toUTC().toISO();

  // move to next allowed time
  // 1) bump to start-of-window today/tonight if same day allowed
  const sameDayAllowed = w.weekdays.includes(local.weekday % 7);
  if (sameDayAllowed) {
    if (w.start <= w.end) {
      // daytime window
      if (local.hour < w.start) {
        local = local.set({ hour: w.start, minute: 0, second: 0, millisecond: 0 });
        return local.toUTC().toISO();
      }
    } else {
      // overnight window, if currently before start (in daytime block), jump to start tonight
      if (local.hour < w.start) {
        local = local.set({ hour: w.start, minute: 0, second: 0, millisecond: 0 });
        return local.toUTC().toISO();
      }
      // if after end (morning block), it's already outside; keep scanning below
    }
  }

  // 2) find next allowed day
  for (let i = 1; i <= 7; i++) {
    const candidate = local.plus({ days: 1 }).startOf("day").plus({ days: i - 1 });
    const dow = candidate.weekday % 7; // 0..6
    if (w.weekdays.includes(dow)) {
      const hour = w.start;
      const next = candidate.set({ hour, minute: 0, second: 0, millisecond: 0 }).setZone(tz);
      return next.toUTC().toISO();
    }
  }
  // fallback (should never happen)
  return local.plus({ days: 1 }).startOf("day").toUTC().toISO();
}