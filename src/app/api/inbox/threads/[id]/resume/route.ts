import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const threadId = params.id;
  if (!threadId) {
    return NextResponse.json({ error: "thread id required" }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: thread, error: threadError } = await supabase
    .from("inbox_threads")
    .select("id, campaign_id, lead_id")
    .eq("id", threadId)
    .maybeSingle();

  if (threadError) {
    return NextResponse.json({ error: threadError.message }, { status: 400 });
  }

  if (!thread) {
    return NextResponse.json({ error: "thread not found" }, { status: 404 });
  }

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, user_id")
    .eq("id", thread.campaign_id)
    .maybeSingle();

  if (campaignError) {
    return NextResponse.json({ error: campaignError.message }, { status: 400 });
  }

  let allowed = campaign?.user_id === user.id;
  if (!allowed) {
    const { data: membership } = await supabase
      .from("campaign_members")
      .select("user_id")
      .eq("campaign_id", thread.campaign_id)
      .eq("user_id", user.id)
      .maybeSingle();
    allowed = !!membership;
  }

  if (!allowed) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: campaignLead, error: campaignLeadError } = await supabaseAdmin
    .from("campaign_leads")
    .select("id")
    .eq("campaign_id", thread.campaign_id)
    .eq("lead_id", thread.lead_id)
    .maybeSingle();

  if (campaignLeadError) {
    return NextResponse.json({ error: campaignLeadError.message }, { status: 400 });
  }

  if (!campaignLead) {
    return NextResponse.json({ error: "campaign lead not found" }, { status: 404 });
  }

  const { error: resumeError } = await supabaseAdmin.rpc("resume_lead_now", { p_lead: campaignLead.id });
  if (resumeError) {
    return NextResponse.json({ error: resumeError.message }, { status: 500 });
  }

  const { error: eventError } = await supabaseAdmin.from("delivery_events").insert({
    campaign_id: thread.campaign_id,
    lead_id: thread.lead_id,
    thread_id: threadId,
    event: "manual_pause",
    meta: { action: "resume" },
  });

  if (eventError) {
    return NextResponse.json({ error: eventError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

