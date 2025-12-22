import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { z } from "zod";

const Body = z.object({
  force_scenario: z.string().optional(),
  force_tone: z.string().optional(),
  duration: z.number().int().min(10).max(180).optional(),
  booking_link: z.string().url().optional(),
  cta: z.string().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const threadId = params.threadId;

  const bodyJson = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }
  const p = parsed.data;

  const { data: thread, error: threadError } = await supabase
    .from("inbox_threads")
    .select("id,campaign_id,lead_id,subject")
    .eq("id", threadId)
    .maybeSingle();
  if (threadError) return NextResponse.json({ error: threadError.message }, { status: 500 });
  if (!thread) return NextResponse.json({ error: "context_not_found" }, { status: 404 });

  const [{ data: lead, error: leadError }, { data: lastInbound, error: lastError }, { data: rule, error: ruleError }, { data: pref, error: prefError }] =
    await Promise.all([
      supabase.from("leads").select("first_name,last_name,company,email").eq("id", thread.lead_id).maybeSingle(),
      supabase.from("v_thread_last_inbound").select("*").eq("thread_id", threadId).maybeSingle(),
      supabase.from("followup_rules").select("*").eq("campaign_id", thread.campaign_id).maybeSingle(),
      supabase.from("meeting_prefs").select("duration_min,booking_link").eq("campaign_id", thread.campaign_id).maybeSingle(),
    ]);

  if (leadError) return NextResponse.json({ error: leadError.message }, { status: 500 });
  if (lastError) return NextResponse.json({ error: lastError.message }, { status: 500 });
  if (ruleError) return NextResponse.json({ error: ruleError.message }, { status: 500 });
  if (prefError) return NextResponse.json({ error: prefError.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: "context_not_found" }, { status: 404 });

  const scenario = (p.force_scenario ?? lastInbound?.ai_label ?? "no_reply").replace(/[^a-z_]/g, "");
  const tone = p.force_tone || rule?.tone || "professional";

  const { data: templateExact, error: templateExactError } = await supabase
    .from("nudge_templates")
    .select("*")
    .eq("campaign_id", thread.campaign_id)
    .eq("tone", tone)
    .eq("scenario", scenario)
    .maybeSingle();
  if (templateExactError) return NextResponse.json({ error: templateExactError.message }, { status: 500 });

  let template = templateExact;

  if (!template) {
    const { data: toneFallback, error: toneFallbackError } = await supabase
      .from("nudge_templates")
      .select("*")
      .eq("campaign_id", thread.campaign_id)
      .eq("tone", tone)
      .eq("scenario", "no_reply")
      .maybeSingle();
    if (toneFallbackError) return NextResponse.json({ error: toneFallbackError.message }, { status: 500 });
    template = toneFallback || null;

    if (!template) {
      const { data: anyFallback, error: anyFallbackError } = await supabase
        .from("nudge_templates")
        .select("*")
        .eq("campaign_id", thread.campaign_id)
        .eq("scenario", "no_reply")
        .maybeSingle();
      if (anyFallbackError) return NextResponse.json({ error: anyFallbackError.message }, { status: 500 });
      template = anyFallback || null;
    }
  }

  const subject = template?.subject ?? "Quick follow-up";
  const bodyTemplate =
    template?.body ??
    ["Hi {lead_first},", "", "Bumping this in case it slipped through. {cta}", "", "{booking_link}", "", "— {me}"].join("\n");

  const duration = p.duration ?? pref?.duration_min ?? 30;
  const bookingLink = p.booking_link ?? pref?.booking_link ?? "";
  const me = "SmartSend"; // TODO: bind to authenticated user profile
  const cta =
    p.cta ??
    (scenario === "question"
      ? "Happy to clarify in 1–2 lines or hop on a quick call."
      : scenario === "positive"
        ? "Want me to lock a time on the calendar?"
        : "Open to a quick intro to see if this is useful?");

  const body = bodyTemplate
    .replaceAll("{lead_first}", lead.first_name ?? "")
    .replaceAll("{company}", lead.company ?? "")
    .replaceAll("{me}", me)
    .replaceAll("{duration}", String(duration))
    .replaceAll("{booking_link}", bookingLink)
    .replaceAll("{last_msg}", (lastInbound?.snippet ?? "").trim())
    .replaceAll("{cta}", cta);

  return NextResponse.json({
    ok: true,
    subject,
    body,
    tone,
    scenario,
  });
}

