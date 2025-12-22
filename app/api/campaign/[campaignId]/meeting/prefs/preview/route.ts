import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest, { params }: { params: { campaignId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { thread_id, template }: { thread_id: string; template?: string | null } = await req.json().catch(() => ({}));
  if (!thread_id) return NextResponse.json({ error: "missing_thread_id" }, { status: 400 });

  const { data: thread } = await supabase
    .from("inbox_threads")
    .select("id,campaign_id,lead_id,subject")
    .eq("id", thread_id)
    .maybeSingle();

  if (!thread) return NextResponse.json({ error: "thread_not_found" }, { status: 404 });

  const [{ data: intent }, { data: prefs }, { data: lead }] = await Promise.all([
    supabase.from("meeting_intents").select("lead_tz,duration_min").eq("thread_id", thread_id).maybeSingle(),
    supabase.from("meeting_prefs").select("location,booking_link,suggestion_template").eq("campaign_id", params.campaignId).maybeSingle(),
    supabase.from("leads").select("first_name,last_name,email").eq("id", thread.lead_id).maybeSingle(),
  ]);

  const { data: slots } = await supabase
    .from("meeting_slots")
    .select("start_utc,end_utc,score")
    .eq("thread_id", thread.id)
    .order("score", { ascending: false })
    .limit(3);

  const leadTz = intent?.lead_tz || "America/New_York";
  const selected = (slots ?? []).map((s) => ({
    start: new Date(s.start_utc),
    end: new Date(s.end_utc),
    tz: leadTz,
  }));

  const defaultTpl = prefs?.suggestion_template ?? null;
  const text = (function render() {
    const pretty = (d: Date, tz: string) =>
      d.toLocaleString(undefined, { timeZone: tz, dateStyle: "medium", timeStyle: "short" });
    const lines = selected.map((o, i) => `${i + 1}) ${pretty(o.start, o.tz)} → ${pretty(o.end, o.tz)}`).join("\n");
    const tpl = template ?? defaultTpl;
    const fallback = [
      `Hi ${lead?.first_name || ""},`,
      ``,
      `Here are a few time options (${intent?.duration_min ?? 30} min, ${prefs?.location || "Google Meet"} — showing in your local time):`,
      lines,
      "",
      prefs?.booking_link ? `Prefer using my scheduler? ${prefs.booking_link}` : "",
      `If none of these work, share a window that’s best for you and I’ll lock it in.`,
      "",
      `— SmartSend`,
    ].join("\n");
    if (!tpl) return fallback;
    return tpl
      .replaceAll("{lead_first}", lead?.first_name || "")
      .replaceAll("{duration}", String(intent?.duration_min ?? 30))
      .replaceAll("{location}", prefs?.location || "")
      .replaceAll("{options}", lines)
      .replaceAll("{booking_link}", prefs?.booking_link || "");
  })();

  return NextResponse.json({ ok: true, preview: text });
}

