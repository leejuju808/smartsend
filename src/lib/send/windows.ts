// Tiny, dependency-free window check. Assumes tz is valid IANA or uses 'Etc/UTC'.

export type WindowSpec = {
  startHour: number;    // 0..23, inclusive
  endHour: number;      // 0..23, exclusive
  skipWeekends: boolean;
};

export function isWithinWindow(nowUTC: Date, tzOffsetMinutes: number, spec: WindowSpec): boolean {
  // Convert 'now' into recipient-local time via offset minutes
  const localMs = nowUTC.getTime() + tzOffsetMinutes * 60_000;
  const local = new Date(localMs);

  const day = local.getUTCDay(); // 0 Sun ... 6 Sat (we're using UTC getters on shifted time)
  if (spec.skipWeekends && (day === 0 || day === 6)) return false;

  const hour = local.getUTCHours();
  // Window: [startHour, endHour)
  if (spec.startHour <= spec.endHour) {
    return hour >= spec.startHour && hour < spec.endHour;
  }
  // Overnight window (e.g., 22–6): allow hour >= start OR hour < end
  return hour >= spec.startHour || hour < spec.endHour;
}

/**
 * Compute a human string explaining why blocked.
 */
export function whyBlocked(nowUTC: Date, tzOffsetMinutes: number, spec: WindowSpec): string | null {
  const localMs = nowUTC.getTime() + tzOffsetMinutes * 60_000;
  const local = new Date(localMs);

  const day = local.getUTCDay();
  if (spec.skipWeekends && (day === 0 || day === 6)) return "Weekend";

  const hour = local.getUTCHours();
  const inWindow = isWithinWindow(nowUTC, tzOffsetMinutes, spec);
  if (inWindow) return null;

  const pad = (n: number) => String(n).padStart(2, "0");
  const range = `${pad(spec.startHour)}:00–${pad(spec.endHour)}:00`;
  return `Outside send window (${range})`;
}

