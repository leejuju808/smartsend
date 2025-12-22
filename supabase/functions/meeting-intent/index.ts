// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Row = Record<string, any>;

const MODEL = "gpt-4.1-mini";

const SYSTEM = `
You extract meeting scheduling info from an email. Output JSON only:
{
  "lead_tz": "America/New_York" | null,
  "duration_min": 15|20|25|30|45|60|90|120 | null,
  "window": { "start": ISO8601|null, "end": ISO8601|null },  // when the sender said they can meet
  "summary": "short"
}
Rules: Guess timezone from phrases like "EST", city names, or email signature if provided.
If they say "tomorrow morning", choose 9:00-12:00 in their timezone.
If no times given, leave window null.
`;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");

if (!SUPABASE_URL || !SERVICE_KEY || !OPENAI_KEY) {
  throw new Error("Missing required environment variables");
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

function parseJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return {};
      }
    }
    return {};
  }
}

function renderSuggestionEmail({
  leadFirst,
  duration,
  location,
  options,
  bookingLink,
  template,
  autoBookLinks,
}: {
  leadFirst?: string | null;
  duration: number;
  location?: string | null;
  options: { start: Date; end: Date; tz: string; link?: string | null }[];
  bookingLink?: string | null;
  template?: string | null;
  autoBookLinks?: boolean | null;
}) {
  const pretty = (d: Date, tz: string) =>
    d.toLocaleString(undefined, { timeZone: tz, dateStyle: "medium", timeStyle: "short" });
  const includeBookLinks = autoBookLinks ?? true;
  const lines = options
    .map((o, i) => {
      const baseLine = `${i + 1}) ${pretty(o.start, o.tz)} → ${pretty(o.end, o.tz)}`;
      return includeBookLinks && o.link ? `${baseLine} — Book: ${o.link}` : baseLine;
    })
    .join("\n");
  const bookingLine = bookingLink ? `Prefer using my scheduler? ${bookingLink}` : ``;

  const fallback = [
    `Hi ${leadFirst || ""},`,
    ``,
    `Here are a few time options (${duration} min, ${location || "Google Meet"} — showing in your local time):`,
    lines,
    ``,
    bookingLine,
    `If none of these work, share a window that’s best for you and I’ll lock it in.`,
    ``,
    `— SmartSend`,
  ].join("\n");

  if (!template) return fallback;

  return template
    .replaceAll("{lead_first}", leadFirst || "")
    .replaceAll("{duration}", String(duration))
    .replaceAll("{location}", location || "")
    .replaceAll("{options}", lines)
    .replaceAll("{booking_link}", bookingLine || "");
}

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
  const seen = new Set<string>();
  const dur = Math.max(15, Math.min(180, args.duration || 30));
  const hasWindow = Boolean(args.window?.start && args.window?.end);

  if (hasWindow) {
    const ws = new Date(args.window!.start!);
    const we = new Date(args.window!.end!);
    for (
      let t = ws.getTime();
      t + dur * 60000 <= we.getTime();
      t += Math.max(dur * 60000, 15 * 60000)
    ) {
      const start = new Date(t);
      const end = new Date(t + dur * 60000);
      const key = start.toISOString();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ start, end, score: 5 });
      if (out.length >= 8) break;
    }
  }

  const maxDays = 10;
  for (let d = 0; d < maxDays; d += 1) {
    const day = new Date(args.now.getTime() + d * 86400000);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: args.leadTz,
      weekday: "numeric" as any,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(day);
    const wk = Number(parts.find((p) => p.type === "weekday")?.value ?? "1"); // 1..7
    if (!hasWindow && !args.workdays.includes(wk)) continue;
    const y = Number(parts.find((p) => p.type === "year")?.value);
    const m = Number(parts.find((p) => p.type === "month")?.value);
    const dd = Number(parts.find((p) => p.type === "day")?.value);

    const hours = new Set<number>();
    for (let h = args.startHour; h <= args.endHour - dur / 60; h += 1) hours.add(h);
    if (args.stoHour != null && hours.has(args.stoHour)) {
      hours.add((args.stoHour + 1) % 24);
      hours.add((args.stoHour + 23) % 24);
    }

    for (const h of hours) {
      const start = new Date(Date.UTC(y, m - 1, dd, h - 8, 5, 0)); // rough UTC shift; OK for proposing
      const end = new Date(start.getTime() + dur * 60000);

      if (hasWindow) {
        const ws = new Date(args.window!.start!);
        const we = new Date(args.window!.end!);
        if (!(start >= ws && end <= we)) continue;
      }

      if (end <= args.now) continue;

      let score = 1;
      if (args.stoHour != null) {
        const diff = Math.min(Math.abs(h - args.stoHour), 24 - Math.abs(h - args.stoHour));
        score += Math.max(0, 2 - diff * 0.8);
      }
      if (h >= 11 && h <= 14) score += 0.2;
      const key = start.toISOString();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ start, end, score });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 8);
}

const ALLOWED_LABELS = new Set(["interested", "book_meeting", "question", "human_reply"]);

Deno.serve(async (req) => {
  try {
    const payload = await req.json().catch(() => ({}));
    const record = payload?.type === "INSERT" ? payload.record : payload;
    if (!record) {
      return new Response(JSON.stringify({ ok: true, skip: "no-record" }), {
        headers: { "content-type": "application/json" },
      });
    }

    if ((record.direction ?? "").toLowerCase() !== "inbound") {
      return new Response(JSON.stringify({ ok: true, skip: "not-inbound" }), {
        headers: { "content-type": "application/json" },
      });
    }
    if (!ALLOWED_LABELS.has((record.ai_label ?? "").toLowerCase())) {
      return new Response(JSON.stringify({ ok: true, skip: "label-filter" }), {
        headers: { "content-type": "application/json" },
      });
    }

    const threadId = record.linked_thread_id ?? record.thread_id;
    if (!threadId) {
      return new Response(JSON.stringify({ ok: false, error: "missing_thread" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select("id,campaign_id,lead_id,subject,account_id")
      .eq("id", threadId)
      .maybeSingle();
    if (threadError) throw threadError;
    if (!thread?.id) {
      return new Response(JSON.stringify({ ok: false, error: "thread_not_found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }

    const { data: prefs } = await supabase
      .from("meeting_prefs")
      .select("*")
      .eq("campaign_id", thread.campaign_id)
      .maybeSingle();

    const campaignTz = prefs?.tz || "America/Los_Angeles";
    const emailText = [
      `Email text:\n${(record.text ?? record.body ?? record.body_plain ?? "").slice(0, 8000)}`,
      `Signature or footer:\n${(record.footer ?? record.body_signature ?? "").slice(0, 2000)}`,
    ].join("\n\n");

    const aiResp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        input: [
          { role: "system", content: SYSTEM },
          { role: "user", content: emailText },
        ],
      }),
    });

    const aiJson = await aiResp.json();
    const parsed = parseJson(aiJson.output_text ?? JSON.stringify(aiJson));

    const { data: sto } = await supabase
      .from("lead_sto_profiles")
      .select("best_hour,tz")
      .eq("campaign_id", thread.campaign_id)
      .eq("lead_id", thread.lead_id)
      .maybeSingle();

    const leadTz: string = parsed?.lead_tz || sto?.tz || "America/New_York";
    const duration: number = parsed?.duration_min || prefs?.duration_min || 30;
    const parsedWindow = parsed?.window ?? {};
    const window = {
      start: typeof parsedWindow?.start === "string" ? parsedWindow.start : null,
      end: typeof parsedWindow?.end === "string" ? parsedWindow.end : null,
    };

    const nowIso = new Date().toISOString();

    await supabase.from("meeting_intents").upsert(
      {
        thread_id: thread.id,
        campaign_id: thread.campaign_id,
        lead_id: thread.lead_id,
        source_message_id: record.id,
        message_id: record.id,
        account_id: thread.account_id ?? null,
        lead_tz: leadTz,
        my_tz: campaignTz,
        timezone: leadTz,
        duration_min: duration,
        window_start: window.start,
        window_end: window.end,
        note: parsed?.summary ?? null,
        raw: parsed ?? null,
        updated_at: nowIso,
      },
      { onConflict: "thread_id" },
    );

    const slots = pickSlots({
      leadTz,
      myTz: campaignTz,
      now: new Date(),
      duration,
      startHour: prefs?.start_hour ?? 9,
      endHour: prefs?.end_hour ?? 17,
      workdays: (prefs?.workdays ?? [1, 2, 3, 4, 5]) as number[],
      stoHour: sto?.best_hour ?? null,
      window,
    });

    await supabase.from("meeting_slots").delete().eq("thread_id", thread.id);

    let insertedSlots: { id: string; start_utc: string; end_utc: string; score: number }[] = [];

    if (slots.length > 0) {
      const insertRes = await supabase
        .from("meeting_slots")
        .insert(
          slots.map((s) => ({
            thread_id: thread.id,
            start_utc: s.start.toISOString(),
            end_utc: s.end.toISOString(),
            score: s.score,
          })),
        )
        .select("id,start_utc,end_utc,score");

      if (insertRes.error) {
        throw insertRes.error;
      }

      insertedSlots = insertRes.data ?? [];
    }

    if (prefs?.auto_insert_suggestions && slots.length > 0) {
      const [{ data: leadRow }, { data: prefRefetch }] = await Promise.all([
        supabase.from("leads").select("first_name,last_name,email").eq("id", thread.lead_id).maybeSingle(),
        supabase
          .from("meeting_prefs")
          .select(
            "location,booking_link,auto_insert_suggestions,suggestion_template,auto_book_links,confirmation_template",
          )
          .eq("campaign_id", thread.campaign_id)
          .maybeSingle(),
      ]);

      const pref2 = prefRefetch ?? prefs ?? {};
      const baseUrl =
        (Deno.env.get("NEXT_PUBLIC_APP_URL") ?? Deno.env.get("APP_URL") ?? "").replace(/\/$/, "");
      const topDbSlots =
        insertedSlots.length > 0
          ? [...insertedSlots].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 3)
          : (
              (
                await supabase
                  .from("meeting_slots")
                  .select("id,start_utc,end_utc,score")
                  .eq("thread_id", thread.id)
                  .order("score", { ascending: false })
                  .limit(3)
              ).data ?? []
            );

      const shouldAutoBook = pref2?.auto_book_links ?? true;
      let bookingLinkMap: Record<string, string> = {};

      if (shouldAutoBook && topDbSlots.length > 0) {
        const tokenRows = topDbSlots.map((slot) => ({
          thread_id: thread.id,
          slot_id: slot.id,
          lead_email: leadRow?.email ?? null,
        }));

        const tokenRes = await supabase
          .from("meeting_booking_tokens")
          .upsert(tokenRows, { onConflict: "thread_id,slot_id" });

        if (tokenRes.error) {
          console.error("meeting booking token upsert failed", tokenRes.error);
        } else if (baseUrl) {
          bookingLinkMap = Object.fromEntries(
            topDbSlots.map((slot) => [slot.id, `${baseUrl}/api/book/${thread.id}:${slot.id}`]),
          );
        }
      }

      const top =
        topDbSlots.length > 0
          ? topDbSlots.map((slot) => ({
              start: new Date(slot.start_utc),
              end: new Date(slot.end_utc),
              tz: leadTz,
              link: bookingLinkMap[slot.id] ?? null,
            }))
          : slots.slice(0, 3).map((s) => ({ start: s.start, end: s.end, tz: leadTz, link: null }));
      const body = renderSuggestionEmail({
        leadFirst: leadRow?.first_name || null,
        duration,
        location: pref2?.location || "Google Meet",
        options: top,
        bookingLink: pref2?.booking_link || null,
        template: pref2?.suggestion_template || null,
        autoBookLinks: pref2?.auto_book_links ?? true,
      });

      try {
        await supabase.from("send_queue").insert([
          {
            campaign_id: thread.campaign_id,
            lead_id: thread.lead_id,
            thread_id: thread.id,
            step_id: null,
            variant_id: null,
            subject: `Re: ${record.subject || thread.subject || "Scheduling"}`,
            body,
            headers: { to: leadRow?.email },
            status: "draft",
            source: "meeting_suggest",
          },
        ]);
      } catch {
        // ignore draft insertion failures
      }
    }

    await supabase
      .from("inbox_threads")
      .update({ has_meeting_intent: true, proposed_meeting: slots.length > 0 })
      .eq("id", thread.id);

    return new Response(
      JSON.stringify({
        ok: true,
        leadTz,
        duration,
        nSlots: slots.length,
      }),
      { headers: { "content-type": "application/json" } },
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ ok: false, error: error?.message ?? String(error) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});


