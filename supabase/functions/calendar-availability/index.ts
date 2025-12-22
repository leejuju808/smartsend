import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { add, isBefore, isWithinInterval, startOfDay } from "https://esm.sh/date-fns@2.30.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

type Payload = {
  calendar_id: string;
  days_ahead?: number;
  count?: number;
  duration_min?: number;
  tz?: string;
  campaign_id: string;
};

type BusyWindow = { start: string; end: string };

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = (await req.json()) as Payload;
    if (!payload.calendar_id || !payload.campaign_id) {
      return jsonResponse({ error: "calendar_id and campaign_id are required" }, 400);
    }

    const daysAhead = payload.days_ahead ?? 10;
    const desiredCount = payload.count ?? 6;

    const { data: calendar, error: calendarError } = await supabase
      .from("calendars")
      .select("*")
      .eq("id", payload.calendar_id)
      .maybeSingle();
    if (calendarError) {
      return jsonResponse({ error: calendarError.message }, 500);
    }
    if (!calendar) {
      return jsonResponse({ error: "Calendar not found" }, 404);
    }

    const { data: prefs, error: prefsError } = await supabase
      .from("meeting_prefs")
      .select("*")
      .eq("campaign_id", payload.campaign_id)
      .maybeSingle();
    if (prefsError) {
      return jsonResponse({ error: prefsError.message }, 500);
    }

    const duration = payload.duration_min ?? prefs?.duration_min ?? 30;
    const tz = payload.tz ?? prefs?.tz ?? calendar.tz ?? "America/Los_Angeles";
    const startHour = prefs?.start_hour ?? 9;
    const endHour = prefs?.end_hour ?? 17;
    const bufferMin = prefs?.buffer_min ?? 15;

    const busy = await fetchBusyWindows(calendar, tz, daysAhead);
    const busyWindows = busy.map((window) => {
      const start = new Date(window.start);
      const end = new Date(window.end);
      if (bufferMin > 0) {
        return {
          start: add(start, { minutes: -bufferMin }),
          end: add(end, { minutes: bufferMin }),
        };
      }
      return { start, end };
    });

    const slots: Array<{ start: string; end: string }> = [];
    const now = new Date();

    for (let d = 0; d < daysAhead && slots.length < desiredCount * 2; d++) {
      const dayStart = startOfDay(add(now, { days: d }));
      const windowStart = add(dayStart, { hours: startHour });
      const windowEnd = add(dayStart, { hours: endHour });

      let slotStart = windowStart;
      while (isBefore(slotStart, windowEnd)) {
        const slotEnd = add(slotStart, { minutes: duration });

        if (isBefore(windowEnd, slotEnd)) {
          break;
        }

        if (isBefore(slotEnd, now)) {
          slotStart = add(slotStart, { minutes: duration });
          continue;
        }

        const overlapsBusy = busyWindows.some((window) =>
          isWithinInterval(slotStart, { start: window.start, end: window.end }) ||
          isWithinInterval(slotEnd, { start: window.start, end: window.end }) ||
          (slotStart <= window.start && slotEnd >= window.end)
        );

        if (!overlapsBusy) {
          slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString() });
        }

        slotStart = add(slotStart, { minutes: duration });
      }
    }

    return jsonResponse({
      slots: slots.slice(0, desiredCount),
      tz,
      duration_min: duration,
    });
  } catch (error) {
    console.error("calendar-availability error", error);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function fetchBusyWindows(
  calendar: Record<string, unknown>,
  tz: string,
  days: number
): Promise<BusyWindow[]> {
  // TODO: integrate with Google/Microsoft APIs using stored access tokens.
  // For now return an empty busy window list.
  void calendar;
  void tz;
  void days;
  return [];
}

