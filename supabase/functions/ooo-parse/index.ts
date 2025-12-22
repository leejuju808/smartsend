import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing Supabase configuration");
}

const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_PATTERNS: RegExp[] = [
  /\b(?:back|return(?:ing)?)\s+(?:on|by|after)?\s*([A-Z][a-z]{2,9}\s+\d{1,2}(?:,\s*\d{4})?)/i,
  /\b(?:out|away)\s+(?:until|thru|through)\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i,
  /\b(?:out|away)\s+(?:until|through)\s*(\d{4}-\d{2}-\d{2})/i,
  /\b(back|returning)\s+(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
];

Deno.serve(async (req) => {
  try {
    const {
      owner_id,
      campaign_id,
      thread_id,
      message_id,
      raw_text,
      prospect_tz = "America/New_York",
    } = await req.json();

    if (!owner_id || !thread_id || !raw_text) {
      return new Response(JSON.stringify({ ok: false, error: "Missing params" }), { status: 400 });
    }

    const now = new Date();
    const found = parseDate(raw_text, now);
    const delegateHint = mentionsDelegate(raw_text);

    let fallback = !found;
    let parsedReturnAt = found?.when ?? new Date(now.getTime() + 7 * DAY_MS);
    let confidence = found?.conf ?? 0.4;

    const { data: existingRows, error: existingError } = await supabase
      .from("ooo_events")
      .select("*")
      .eq("owner_id", owner_id)
      .eq("thread_id", thread_id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (existingError) {
      throw existingError;
    }

    const existing = existingRows?.[0];
    const withinSevenDays =
      existing && existing.created_at ? now.getTime() - new Date(existing.created_at).getTime() <= 7 * DAY_MS : false;

    if (fallback && existing?.fallback) {
      parsedReturnAt = addBusinessDays(now, 10);
      confidence = Math.min(confidence, 0.35);
    }

    const scheduledAt = toBusinessMorning(parsedReturnAt, prospect_tz, 9, 10);
    const payload = {
      campaign_id,
      message_id,
      raw_text,
      parsed_return_at: parsedReturnAt.toISOString(),
      confidence,
      fallback,
      scheduled_followup_at: scheduledAt.toISOString(),
      status: "paused" as const,
    };

    let eventId: string;
    let scheduledFollowup = scheduledAt.toISOString();

    if (existing && withinSevenDays) {
      const { data: updatedRow, error: updateError } = await supabase
        .from("ooo_events")
        .update(payload)
        .eq("id", existing.id)
        .select("id, scheduled_followup_at")
        .single();

      if (updateError) {
        throw updateError;
      }

      eventId = updatedRow.id;
      scheduledFollowup = updatedRow.scheduled_followup_at ?? scheduledFollowup;
    } else {
      const { data: insertedRow, error: insertError } = await supabase
        .from("ooo_events")
        .insert([{ owner_id, thread_id, ...payload }])
        .select("id, scheduled_followup_at")
        .single();

      if (insertError) {
        throw insertError;
      }

      eventId = insertedRow.id;
      scheduledFollowup = insertedRow.scheduled_followup_at ?? scheduledFollowup;
    }

    const { error: threadError } = await supabase
      .from("threads")
      .update({ is_paused: true, paused_reason: "ooo" })
      .eq("id", thread_id);

    if (threadError) {
      throw threadError;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        ooo_event_id: eventId,
        parsed_return_at: parsedReturnAt.toISOString(),
        scheduled_followup_at: scheduledFollowup,
        confidence,
        fallback,
        delegate_hint: delegateHint,
        updated: Boolean(existing && withinSevenDays),
      }),
      { status: 200 },
    );
  } catch (error) {
    console.error("ooo-parse failure", error);
    return new Response(JSON.stringify({ ok: false, error: String(error?.message ?? error) }), { status: 500 });
  }
});

type ParsedDate = { when: Date; conf: number };

function parseDate(text: string, now = new Date()): ParsedDate | null {
  for (const re of DATE_PATTERNS) {
    const match = text.match(re);
    if (!match) continue;

    const group = match[2] ?? match[1];
    if (!group) continue;

    if (/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(group)) {
      const weekdayIndex = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(
        group.toLowerCase(),
      );
      if (weekdayIndex === -1) continue;

      const candidate = new Date(now);
      for (let i = 0; i < 14; i += 1) {
        candidate.setDate(candidate.getDate() + 1);
        if (candidate.getDay() === weekdayIndex) {
          return { when: candidate, conf: 0.65 };
        }
      }
      continue;
    }

    const direct = new Date(group);
    if (!Number.isNaN(direct.getTime())) {
      return { when: direct, conf: 0.8 };
    }

    if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(group)) {
      const parts = group.split("/");
      const month = Number(parts[0]) - 1;
      const day = Number(parts[1]);
      const yearPart = parts[2] ? Number(parts[2]) : now.getFullYear();
      const year = yearPart < 100 ? 2000 + yearPart : yearPart;
      const fallbackDate = new Date(year, month, day);
      if (!Number.isNaN(fallbackDate.getTime())) {
        return { when: fallbackDate, conf: 0.75 };
      }
    }
  }

  return null;
}

function toBusinessMorning(date: Date, timeZone: string, hour = 9, minute = 10): Date {
  const candidate = new Date(date);
  candidate.setMilliseconds(0);

  while (isWeekend(candidate, timeZone)) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }

  const { year, month, day } = getDateParts(candidate, timeZone);
  return zonedTimeToUtc(year, month, day, hour, minute, timeZone);
}

function isWeekend(date: Date, timeZone: string): boolean {
  const weekdayFormatter = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" });
  const part = weekdayFormatter.formatToParts(date).find((p) => p.type === "weekday")?.value ?? "Sun";
  const normalized = part.slice(0, 3).toLowerCase();
  return normalized === "sat" || normalized === "sun";
}

function getDateParts(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")?.value ?? "1970");
  const month = Number(parts.find((p) => p.type === "month")?.value ?? "01");
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "01");
  return { year, month, day };
}

function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  const offset = getOffsetMilliseconds(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offset);
}

function getOffsetMilliseconds(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));

  const asUtc = Date.UTC(
    Number(lookup.year ?? "1970"),
    Number(lookup.month ?? "01") - 1,
    Number(lookup.day ?? "01"),
    Number(lookup.hour ?? "00"),
    Number(lookup.minute ?? "00"),
    Number(lookup.second ?? "00"),
  );

  return asUtc - date.getTime();
}

function addBusinessDays(start: Date, businessDays: number): Date {
  const result = new Date(start);
  let added = 0;
  while (added < businessDays) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) {
      added += 1;
    }
  }
  return result;
}

function mentionsDelegate(text: string): boolean {
  const lowered = text.toLowerCase();
  const delegatePatterns = [
    /contact\s+(?:my|our)?\s*(?:colleague|coworker|associate|team)/i,
    /reach\s+out\s+to\s+[A-Z][a-z]+\s+[A-Z][a-z]+/i,
    /email\s+(?:my|our)?\s*(?:assistant|team)/i,
    /(?:while\s+i'm\s+out|during\s+my\s+absence).*?(?:contact|reach out)/i,
  ];
  return delegatePatterns.some((pattern) => pattern.test(lowered));
}

