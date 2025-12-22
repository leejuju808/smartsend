// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function inWindow(d: Date, days: number[], start: number, end: number, tz: string) {
  const local = new Date(d.toLocaleString("en-US", { timeZone: tz }));
  const dow = local.getDay() === 0 ? 7 : local.getDay();
  const hour = local.getHours();
  return days.includes(dow) && hour >= start && hour < end;
}

function addMinutes(d: Date, min: number) {
  return new Date(d.getTime() + min * 60000);
}

function formatLocal(d: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return fmt.format(d);
}

Deno.serve(async (req) => {
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  try {
    const url = new URL(req.url);
    const threadId = url.searchParams.get("thread_id");
    const mode = (url.searchParams.get("mode") ?? "draft") as "draft" | "send";
    if (!threadId) return new Response("Missing thread_id", { status: 400 });

    const { data: mi } = await sb.from("meeting_intents").select("*").eq("thread_id", threadId).maybeSingle();
    if (!mi)
      return new Response(JSON.stringify({ ok: false, error: "no meeting_intents" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });

    const { data: camp } = await sb
      .from("campaigns")
      .select(
        "meet_my_tz, meet_duration_min, meet_days, meet_hours_start, meet_hours_end, meet_buffer_min, name",
      )
      .eq("id", mi.campaign_id)
      .maybeSingle();
    const { data: lead } = await sb.from("leads").select("email, name, tz").eq("id", mi.lead_id).maybeSingle();

    const myTz = mi.my_tz ?? camp?.meet_my_tz ?? "UTC";
    const leadTz = mi.lead_tz ?? lead?.tz ?? myTz;
    const dur = camp?.meet_duration_min ?? 30;

    const baseCandidates: Date[] = (mi.candidate_iso ?? []).slice(0, 3).map((iso: string) => new Date(iso));
    const proposals: { start: Date; end: Date }[] = [];
    const days = (camp?.meet_days ?? [1, 2, 3, 4, 5]) as number[];
    const startH = camp?.meet_hours_start ?? 9;
    const endH = camp?.meet_hours_end ?? 17;

    for (const c of baseCandidates) {
      const ok = inWindow(c, days, startH, endH, myTz);
      const start = ok ? c : new Date(c);
      if (!ok) {
        for (let i = 0; i < 7; i++) {
          const tmp = addMinutes(start, i * 24 * 60);
          const shifted = new Date(tmp.setHours(startH, 0, 0, 0));
          if (inWindow(shifted, days, startH, endH, myTz)) {
            start.setTime(shifted.getTime());
            break;
          }
        }
      }
      proposals.push({ start, end: addMinutes(start, dur) });
      if (proposals.length >= 3) break;
    }

    let cursor = new Date();
    while (proposals.length < 3) {
      cursor = addMinutes(cursor, 60);
      if (inWindow(cursor, days, startH, endH, myTz)) {
        const start = new Date(cursor);
        proposals.push({ start, end: addMinutes(start, dur) });
      }
      if (proposals.length >= 3) break;
    }

    const lines = proposals
      .map((p) => {
        const me = `${formatLocal(p.start, myTz)}–${formatLocal(p.end, myTz)} (${myTz})`;
        const them = `${formatLocal(p.start, leadTz)}–${formatLocal(p.end, leadTz)} (${leadTz})`;
        return `<li>${me} • <span style="color:#888">Your time:</span> ${them}</li>`;
      })
      .join("");

    const subject = `Quick intro call — ${camp?.name ?? "SmartSend"}`;
    const html = `<p>Hi${lead?.name ? " " + lead.name.split(" ")[0] : ""},</p>
<p>Happy to set this up. Here are a few times that should work on my end:</p>
<ul>${lines}</ul>
<p>If none of those work, feel free to suggest a time that’s best for you. I can also send a calendar invite once we lock it.</p>
<p>Best,<br/>${camp?.name ?? "Team"}</p>`;

    if (mode === "draft") {
      const { data: d, error } = await sb
        .from("reply_drafts")
        .upsert(
          {
            thread_id: threadId,
            campaign_id: mi.campaign_id,
            lead_id: mi.lead_id,
            subject,
            body_html: html,
            needs_reply: true,
            meta: { origin: "meeting-propose", lead_tz: leadTz, my_tz: myTz },
          },
          { onConflict: "thread_id" },
        )
        .select("id")
        .maybeSingle();
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, draft_id: d?.id }), {
        headers: { "content-type": "application/json" },
      });
    }

    const { data: s, error } = await sb
      .from("send_queue")
      .insert({
        campaign_id: mi.campaign_id,
        lead_id: mi.lead_id,
        thread_id: threadId,
        subject,
        body_html: html,
        priority: 9,
        send_after: new Date().toISOString(),
        meta: { origin: "meeting-propose", lead_tz: leadTz, my_tz: myTz },
      })
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true, send_queue_id: s?.id }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
});



