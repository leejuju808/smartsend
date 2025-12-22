import { DateTime } from "luxon";

export type Window = { dow: number[]; start: string; end: string }; // dow: 1(Mon)..7(Sun)
export type Plan = {
  timezone: string;
  windows: Window[];
  per_day: number;
  min_gap_seconds: number;
};

function* iterateSlots(plan: Plan, fromISO: string) {
  const tz = plan.timezone;
  let t = DateTime.fromISO(fromISO, { zone: tz }).plus({ seconds: 1 });

  while (true) {
    // advance into a valid window
    const todayDow = t.weekday;
    const todays = plan.windows.filter(w => w.dow.includes(todayDow));

    // find next candidate inside today; if none, jump to next day 00:00
    let advanced = false;
    for (const w of todays) {
      const start = DateTime.fromObject(
        { year: t.year, month: t.month, day: t.day,
          hour: Number(w.start.slice(0,2)), minute: Number(w.start.slice(3,5)) }, { zone: tz });
      const end = DateTime.fromObject(
        { year: t.year, month: t.month, day: t.day,
          hour: Number(w.end.slice(0,2)), minute: Number(w.end.slice(3,5)) }, { zone: tz });

      const inWindowStart = t < start ? start : t;
      if (inWindowStart <= end) {
        // we're inside or at the start; emit this time and then gap forward
        yield inWindowStart.toUTC().toISO();
        t = inWindowStart.plus({ seconds: plan.min_gap_seconds });
        advanced = true;
        break;
      }
    }
    if (!advanced) {
      // jump to tomorrow 00:00 local
      t = t.plus({ days: 1 }).startOf("day");
    }
  }
}

export function planScheduleTimes(plan: Plan, count: number, fromISO?: string) {
  const start = fromISO ?? new Date().toISOString();
  const out: string[] = [];
  const it = iterateSlots(plan, start);
  while (out.length < count) {
    out.push(it.next().value as string);
  }
  return out; // UTC ISO timestamps
}
