export function nextAtHour(tz: string, hourLocal: number): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);
  const curHour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");

  const curDateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = Number(curDateParts.find((p) => p.type === "year")?.value);
  const m = Number(curDateParts.find((p) => p.type === "month")?.value);
  const d = Number(curDateParts.find((p) => p.type === "day")?.value);

  const targetDay =
    curHour <= hourLocal
      ? new Date(Date.UTC(y, m - 1, d))
      : new Date(Date.UTC(y, m - 1, d + 1));

  const candidate = new Date(targetDay);
  candidate.setUTCHours(hourLocal, 5, 0, 0);
  return candidate;
}

