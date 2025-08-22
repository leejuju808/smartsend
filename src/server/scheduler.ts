import { supabaseAdmin } from "@/src/server/supabase";

export function addDays(date: Date, days: number) {
  const d = new Date(date); d.setUTCDate(d.getUTCDate() + days); return d;
}

// pick a friendly hour for follow-ups (10:05 local time)
export function atFriendlyHour(d: Date, tz: string, hourLocal = 10): Date {
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(d);
  const parts = Object.fromEntries(local.map(p => [p.type, p.value]));
  const iso = `${parts.year}-${parts.month}-${parts.day}T00:00:00.000Z`;
  const base = new Date(iso);
  base.setUTCHours(hourLocal, 5, 0, 0);
  return base;
}

export function bumpOutOfQuiet(now: Date, tz: string, quietStart: number, quietEnd: number): Date {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hour12: false }).format(now));
  const inQuiet = quietStart <= quietEnd ? (hour >= quietStart && hour < quietEnd) : (hour >= quietStart || hour < quietEnd);
  if (!inQuiet) return now;
  // schedule at quietEnd today/tomorrow
  const resume = new Date(now);
  const addDay = quietEnd <= hour ? 1 : 0;
  resume.setUTCDate(resume.getUTCDate() + addDay);
  resume.setUTCHours(quietEnd, 0, 0, 0);
  return resume;
}

export async function getProfilePolicy(ownerId: string) {
  const { data: p } = await supabaseAdmin.from("profiles")
    .select("subscription_status, tz, quiet_start, quiet_end, id").eq("id", ownerId).single();
  return {
    tz: p?.tz || "America/Los_Angeles",
    quietStart: p?.quiet_start ?? 21,
    quietEnd: p?.quiet_end ?? 6
  };
}

export async function nextStepInfo(sequenceId: string, stepNo: number) {
  // fetch current + next step and their delays
  const { data: steps } = await supabaseAdmin
    .from("sequence_steps")
    .select("step_no, delay_days, subject, body")
    .eq("sequence_id", sequenceId)
    .order("step_no", { ascending: true });
  const cur = steps?.find(s => s.step_no === stepNo);
  const nxt = steps?.find(s => s.step_no === stepNo + 1);
  return { cur, nxt };
}

