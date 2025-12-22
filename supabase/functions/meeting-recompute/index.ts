// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Row = Record<string, any>;

function pickSlots(args: {
  leadTz: string;
  myTz: string;
  now: Date;
  duration: number;
  startHour: number;
  endHour: number;
  workdays: number[];
  stoHour?: number | null;
  window?: { start?: string | null; end?: string | null };
}) {
  const out: { start: Date; end: Date; score: number }[] = [];
  const dur = Math.max(15, Math.min(180, args.duration || 30));
  const maxDays = 10;

  for (let d = 0; d < maxDays; d++) {
    const day = new Date(args.now.getTime() + d * 86400000);
    const weekday = Number(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: args.leadTz,
        weekday: "numeric" as any,
      }).format(day),
    );
    if (!args.workdays.includes(weekday)) continue;

    const hours = new Set<number>();
    for (
      let h = args.startHour;
      h <= args.endHour - Math.ceil(dur / 60);
      h++
    ) {
      hours.add(h);
    }
    if (args.stoHour != null && hours.has(args.stoHour)) {
      hours.add((args.stoHour + 1) % 24);
      hours.add((args.stoHour + 23) % 24);
    }

    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: args.leadTz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(day);
    const y = Number(ymd.find((p) => p.type === "year")?.value);
    const m = Number(ymd.find((p) => p.type === "month")?.value);
    const dd = Number(ymd.find((p) => p.type === "day")?.value);

    for (const h of hours) {
      // schedule at :05 to avoid "on the dot"
      const start = new Date(Date.UTC(y, m - 1, dd, h - 8, 5, 0));
      const end = new Date(start.getTime() + dur * 60000);

      if (args.window?.start && args.window?.end) {
        const ws = new Date(args.window.start);
        const we = new Date(args.window.end);
        if (!(start >= ws && end <= we)) continue;
      }

      let score = 1;
      if (args.stoHour != null) {
        const diff = Math.min(
          Math.abs(h - args.stoHour),
          24 - Math.abs(h - args.stoHour),
        );
        score += Math.max(0, 2 - diff * 0.8);
      }
      if (h >= 11 && h <= 14) score += 0.2;
      out.push({ start, end, score });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 8);
}

Deno.serve(async (req) => {
  const env = (k: string) => Deno.env.get(k)!;
  const sb = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY")!;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Prefer: "return=representation",
  };

  const { thread_id } = await req.json().catch(() => ({}));
  if (!thread_id) {
    return new Response(JSON.stringify({ error: "missing thread_id" }), {
      status: 400,
    });
  }

  const [tR, iR] = await Promise.all([
    fetch(
      `${sb}/rest/v1/inbox_threads?select=id,campaign_id,lead_id&eq.id=${thread_id}`,
      { headers },
    ),
    fetch(
      `${sb}/rest/v1/meeting_intents?select=*&thread_id=eq.${thread_id}`,
      { headers },
    ),
  ]);
  const thread: Row = (await tR.json())[0] ?? {};
  const intent: Row = (await iR.json())[0] ?? {};
  if (!thread?.id) {
    return new Response(JSON.stringify({ error: "thread_not_found" }), {
      status: 404,
    });
  }

  const pR = await fetch(
    `${sb}/rest/v1/meeting_prefs?select=*&campaign_id=eq.${thread.campaign_id}`,
    { headers },
  );
  const prefs: Row = (await pR.json())[0] ?? {};

  const stoR = await fetch(
    `${sb}/rest/v1/lead_sto_profiles?select=best_hour,tz&campaign_id=eq.${thread.campaign_id}&lead_id=eq.${thread.lead_id}`,
    { headers },
  );
  const sto: Row = (await stoR.json())[0] ?? {};

  const leadTz = intent?.lead_tz || sto?.tz || "America/New_York";
  const duration = intent?.duration_min || prefs?.duration_min || 30;
  const workdays = (prefs?.workdays ?? [1, 2, 3, 4, 5]) as number[];
  const startHour = prefs?.start_hour ?? 9;
  const endHour = prefs?.end_hour ?? 17;
  const stoHour = sto?.best_hour ?? null;
  const window = intent?.window_start && intent?.window_end
    ? { start: intent.window_start, end: intent.window_end }
    : undefined;
  const myTz = prefs?.tz || "America/Los_Angeles";

  await fetch(
    `${sb}/rest/v1/meeting_slots?thread_id=eq.${thread.id}`,
    {
      method: "DELETE",
      headers: { ...headers, Prefer: "return=representation" },
    },
  );

  const slots = pickSlots({
    leadTz,
    myTz,
    now: new Date(),
    duration,
    startHour,
    endHour,
    workdays,
    stoHour,
    window,
  });

  if (slots.length) {
    await fetch(`${sb}/rest/v1/meeting_slots`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(
        slots.map((s) => ({
          thread_id: thread.id,
          start_utc: s.start.toISOString(),
          end_utc: s.end.toISOString(),
          score: s.score,
        })),
      ),
    });
  }

  await fetch(
    `${sb}/rest/v1/inbox_threads?id=eq.${thread.id}`,
    {
      method: "PATCH",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify([{ proposed_meeting: true }]),
    },
  );

  return new Response(
    JSON.stringify({ ok: true, nSlots: slots.length, leadTz, duration }),
    { headers: { "Content-Type": "application/json" } },
  );
});

