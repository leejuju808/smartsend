import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const { thread_id }: { thread_id?: string } = await req.json();

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
    .select("id, lead_id, campaign_id, is_suppressed")
    .eq("id", thread_id)
    .single();

  if (threadError || !thread) {
    return NextResponse.json({ error: "unavailable" }, { status: 404 });
  }
  if (thread.is_suppressed) {
    return NextResponse.json({ error: "suppressed" }, { status: 400 });
  }

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("booking_link, owner_id")
    .eq("id", thread.campaign_id)
    .single();

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "campaign_not_found" }, { status: 404 });
  }
  if (!campaign.booking_link) {
    return NextResponse.json({ error: "no_booking_link" }, { status: 400 });
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("email")
    .eq("id", thread.lead_id)
    .single();

  if (leadError || !lead?.email) {
    return NextResponse.json({ error: "lead_missing_email" }, { status: 400 });
  }

  const subject = "Quick link to book a time";
  const body = `Here's the fastest way to lock a slot on my calendar:\n\n${campaign.booking_link}\n\nLooking forward to it!`;
  const senderEmail = "no-reply@yourbrand.com";
  const idemKey = `book:${thread_id}:${Date.now()}`;

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
    p_subject: subject,
    p_body: body,
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
    .update({ last_action: "book", last_action_at: new Date().toISOString() })
    .eq("id", thread_id);

  return NextResponse.json({ ok: true, send_id: sendId, subject, body });
}

