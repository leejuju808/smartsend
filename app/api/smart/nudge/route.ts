import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

const ALLOWED_REVIEW_INTENTS = new Set(["no_reply", "neutral"]);

export async function POST(req: Request) {
  const { thread_id, tone = "concise" }: { thread_id?: string; tone?: string } = await req.json();

  if (!thread_id) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const supabase = await createServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: thread, error: threadError } = await supabase
    .from("inbox_threads")
    .select("id, lead_id, campaign_id, is_suppressed, needs_review, ai_intent")
    .eq("id", thread_id)
    .single();

  if (threadError || !thread) {
    return NextResponse.json({ error: "unavailable" }, { status: 404 });
  }
  if (thread.is_suppressed) {
    return NextResponse.json({ error: "suppressed" }, { status: 400 });
  }
  if (thread.needs_review && !ALLOWED_REVIEW_INTENTS.has(thread.ai_intent ?? "")) {
    return NextResponse.json({ error: "needs_review" }, { status: 409 });
  }

  const { data: variant, error: variantError } = await supabase
    .from("nudge_variants")
    .select("id, subject, body")
    .eq("campaign_id", thread.campaign_id)
    .eq("scenario", "no_reply")
    .eq("tone", tone)
    .eq("is_active", true)
    .order("weight", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (variantError) {
    return NextResponse.json({ error: "variant_lookup_failed", detail: variantError.message }, { status: 400 });
  }
  if (!variant) {
    return NextResponse.json({ error: "no_variant" }, { status: 400 });
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("email")
    .eq("id", thread.lead_id)
    .single();

  if (leadError || !lead?.email) {
    return NextResponse.json({ error: "lead_missing_email" }, { status: 400 });
  }

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("owner_id")
    .eq("id", thread.campaign_id)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "campaign_not_found" }, { status: 404 });
  }

  const senderEmail = "no-reply@yourbrand.com";
  const idemKey = `nudge:${thread_id}:${Date.now()}`;

  const { data: gate, error: gateError } = await supabase.rpc("preflight_check", {
    p_campaign_id: thread.campaign_id,
    p_account_id: campaign.owner_id,
    p_lead_id: thread.lead_id,
    p_to: lead.email,
    p_sender_email: senderEmail,
    p_idem_key: idemKey,
  });

  if (gateError) {
    return NextResponse.json({ error: gateError.message }, { status: 400 });
  }

  if (!gate?.ok) {
    return NextResponse.json(
      { ok: false, error: gate?.error ?? "preflight_block", meta: gate?.meta ?? {} },
      { status: 409 },
    );
  }

  const { data: sendId, error: sendError } = await supabase.rpc("enqueue_send", {
    p_campaign_id: thread.campaign_id,
    p_account_id: campaign.owner_id,
    p_lead_id: thread.lead_id,
    p_to: lead.email,
    p_subject: variant.subject,
    p_body: variant.body,
    p_sender_email: senderEmail,
    p_idem_key: idemKey,
  });

  if (sendError || !sendId) {
    return NextResponse.json(
      { error: "blocked_or_failed", detail: sendError?.message },
      { status: 400 },
    );
  }

  await supabase
    .from("inbox_threads")
    .update({ last_action: "nudge", last_action_at: new Date().toISOString() })
    .eq("id", thread_id);

  return NextResponse.json({ ok: true, send_id: sendId });
}

