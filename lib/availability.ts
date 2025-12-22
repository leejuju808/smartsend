import { DateTime } from "luxon";

export type Slot = { start: string; end: string };

export function nextSlots(opts: {
  tz: string;
  startFromISO: string;
  workdays: number[];
  startHour: number;
  endHour: number;
  durationMin: number;
  bufferMin: number;
  count?: number;
}): Slot[] {
  const count = opts.count ?? 3;
  const slots: Slot[] = [];
  let t = DateTime.fromISO(opts.startFromISO, { zone: opts.tz }).startOf("minute");
  if (!t.isValid) t = DateTime.now().setZone(opts.tz);

  const isWorkday = (d: DateTime) => opts.workdays.includes(d.weekday);
  const clampToWindow = (d: DateTime) => {
    const start = d.set({ hour: opts.startHour, minute: 0, second: 0, millisecond: 0 });
    const end = d.set({ hour: opts.endHour, minute: 0, second: 0, millisecond: 0 });
    if (d < start) return start;
    if (d >= end) return start.plus({ days: 1 });
    return d;
  };

  t = clampToWindow(t);
  while (slots.length < count) {
    if (!isWorkday(t)) {
      t = t.plus({ days: 1 }).set({ hour: opts.startHour, minute: 0, second: 0, millisecond: 0 });
      continue;
    }
    const end = t.plus({ minutes: opts.durationMin });
    const dayEnd = t.set({ hour: opts.endHour, minute: 0, second: 0, millisecond: 0 });
    if (end <= dayEnd) {
      slots.push({ start: t.toISO(), end: end.toISO() });
      t = end.plus({ minutes: opts.bufferMin });
    } else {
      t = t.plus({ days: 1 }).set({ hour: opts.startHour, minute: 0, second: 0, millisecond: 0 });
    }
    t = clampToWindow(t);
  }
  return slots;
}

export function formatSlotsHuman(slots: Slot[], tz: string): string[] {
  return slots.map((s) => {
    const a = DateTime.fromISO(s.start, { zone: tz });
    const b = DateTime.fromISO(s.end, { zone: tz });
    const sameDay = a.hasSame(b, "day");
    const date = a.toFormat("EEE, MMM d");
    const timeA = a.toFormat("h:mm a");
    const timeB = b.toFormat("h:mm a");
    return sameDay
      ? `${date} · ${timeA}–${timeB} (${a.offsetNameShort})`
      : `${date} ${timeA} → ${b.toFormat("EEE, MMM d h:mm a")} (${a.offsetNameShort})`;
  });
}




