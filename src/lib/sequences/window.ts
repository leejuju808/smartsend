export type SendWindow = { days: number[]; start_hour: number; end_hour: number };

export function isWithinWindow(d: Date, tzOffsetMinutes = 0, win: SendWindow) {
  // naive: apply fixed tz offset (0 = UTC). For v1 we assume DEFAULT_TIMEZONE is PT.
  const local = new Date(d.getTime() - tzOffsetMinutes * 60_000);
  const dow = local.getUTCDay(); // 0..6 (Sun..Sat)
  const isAllowedDay = win.days.includes(dow);
  const hour = local.getUTCHours();
  return isAllowedDay && hour >= win.start_hour && hour < win.end_hour;
}

export function nextWindowStart(d: Date, tzOffsetMinutes = 0, win: SendWindow) {
  // Advances to the next allowed hour boundary within allowed days.
  let t = new Date(d);
  for (let i = 0; i < 14 * 24; i++) { // within 2 weeks
    t = new Date(t.getTime() + 60 * 60 * 1000);
    if (isWithinWindow(t, tzOffsetMinutes, win)) {
      const local = new Date(t.getTime() - tzOffsetMinutes * 60_000);
      const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), win.start_hour, 0, 0));
      return new Date(start.getTime() + tzOffsetMinutes * 60_000);
    }
  }
  return new Date(d.getTime() + 24 * 60 * 60 * 1000);
} 