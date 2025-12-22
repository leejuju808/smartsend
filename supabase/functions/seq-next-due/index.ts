import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function toTZ(d: Date, tz: string): Date {
  // Convert date to timezone-aware date using Intl
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  const year = parseInt(parts.find((p) => p.type === "year")!.value);
  const month = parseInt(parts.find((p) => p.type === "month")!.value) - 1;
  const day = parseInt(parts.find((p) => p.type === "day")!.value);
  const hour = parseInt(parts.find((p) => p.type === "hour")!.value);
  const minute = parseInt(parts.find((p) => p.type === "minute")!.value);
  const second = parseInt(parts.find((p) => p.type === "second")!.value);

  return new Date(Date.UTC(year, month, day, hour, minute, second));
}

function isWeekend(d: Date): boolean {
  return d.getUTCDay() === 0 || d.getUTCDay() === 6;
}

serve(async (req) => {
  try {
    const { org_id, base_from, wait_days } = await req.json();

    if (!org_id) {
      return new Response(
        JSON.stringify({ error: "org_id required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Load org settings
    const { data: s } = await supabase
      .from("org_send_settings")
      .select("*")
      .eq("org_id", org_id)
      .maybeSingle();

    const tz = s?.timezone || "America/Los_Angeles";
    const start = s?.window_start || "09:00";
    const end = s?.window_end || "17:00";
    const skipWeekends = s?.skip_weekends ?? true;

    // Start with base_from + wait_days
    let d = new Date(base_from || new Date());
    d.setUTCDate(d.getUTCDate() + (wait_days ?? 2));

    // Snap into window in org TZ
    let attempts = 0;
    while (attempts < 30) {
      attempts++;
      const local = toTZ(d, tz);

      if (skipWeekends && isWeekend(local)) {
        d.setUTCDate(d.getUTCDate() + 1);
        continue;
      }

      const [sh, sm] = String(start).split(":").map(Number);
      const [eh, em] = String(end).split(":").map(Number);

      // Get today's date components in local timezone
      const localYear = local.getUTCFullYear();
      const localMonth = local.getUTCMonth();
      const localDay = local.getUTCDate();

      // Construct that day's send window in local time (UTC)
      const localStart = new Date(Date.UTC(localYear, localMonth, localDay, sh, sm || 0, 0, 0));
      const localEnd = new Date(Date.UTC(localYear, localMonth, localDay, eh, em || 0, 0, 0));

      // Convert back to UTC for comparison with d (which is in UTC)
      const localTime = local.getTime();

      if (localTime < localStart.getTime()) {
        // Before window, set to start
        d = localStart;
        break;
      } else if (localTime > localEnd.getTime()) {
        // After window, move to next day start
        d.setUTCDate(d.getUTCDate() + 1);
        continue;
      } else {
        // Inside window; use current time
        break;
      }
    }

    return new Response(
      JSON.stringify({ due_at: d.toISOString(), tz }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

