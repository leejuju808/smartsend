import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const [{ data: slots, error: slotsError }, { data: ctx, error: ctxError }] = await Promise.all([
    supabase
      .from("meeting_slots")
      .select("id,start_utc,end_utc,score")
      .eq("thread_id", params.threadId)
      .order("score", { ascending: false })
      .limit(6),
    supabase
      .from("inbox_threads")
      .select("id,campaign_id,lead_id,subject,has_meeting_intent")
      .eq("id", params.threadId)
      .maybeSingle(),
  ]);

  if (ctxError) {
    return NextResponse.json({ error: ctxError.message }, { status: 400 });
  }

  if (!ctx) {
    return NextResponse.json({ error: "thread_not_found" }, { status: 404 });
  }

  if (slotsError) {
    return NextResponse.json({ error: slotsError.message }, { status: 400 });
  }

  const { data: intent, error: intentError } = await supabase
    .from("meeting_intents")
    .select("lead_tz,my_tz,duration_min")
    .eq("thread_id", params.threadId)
    .maybeSingle();

  if (intentError) {
    return NextResponse.json({ error: intentError.message }, { status: 400 });
  }

  const leadTz = intent?.lead_tz || "America/New_York";
  const top = (slots ?? []).sort((a, b) => b.score - a.score).slice(0, 3);

  if (top.length === 0) {
    return NextResponse.json({ ok: true, text: null, leadTz, n: 0 });
  }

  const { data: prefs } = await supabase
    .from("meeting_prefs")
    .select("auto_book_links")
    .eq("campaign_id", ctx.campaign_id)
    .maybeSingle();

  const enableLinks = prefs?.auto_book_links ?? true;

  let linkItems: Array<{ slot_id: string; url: string }> = [];
  if (enableLinks) {
    try {
      const baseUrl = req.nextUrl?.origin || process.env.NEXT_PUBLIC_APP_URL || "";
      const cookieHeader = cookies().toString();
      const linkRes = await fetch(
        `${baseUrl.replace(/\/$/, "")}/api/thread/${params.threadId}/meeting/booking-links`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(cookieHeader ? { Cookie: cookieHeader } : {}),
          },
          body: JSON.stringify({ top_n: top.length }),
        },
      );
      const linkJson = await linkRes.json().catch(() => ({}));
      if (linkRes.ok && Array.isArray(linkJson?.items)) {
        linkItems = linkJson.items.map((item: any) => ({
          slot_id: item.slot_id,
          url: item.url,
        }));
      }
    } catch (err) {
      console.error("booking links fetch failed", err);
    }
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      timeZone: leadTz,
      dateStyle: "medium",
      timeStyle: "short",
    });

  const lines = top.map((s, i) => {
    const link = linkItems.find((item) => item.slot_id === s.id)?.url;
    return `${i + 1}) ${fmt(s.start_utc)} → ${fmt(s.end_utc)}${
      enableLinks && link ? ` — Book: ${link}` : ""
    }`;
  });
  const text = [
    "Here are a few options that should work on my end (showing in your local time):",
    ...lines,
    "",
    "If none of these work, share a window that’s best for you and I’ll lock it in.",
  ].join("\n");

  return NextResponse.json({ ok: true, text, leadTz, n: top.length });
}


