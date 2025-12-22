import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(
  _req: Request,
  { params }: { params: { inbound_id?: string } },
) {
  const inboundId = params.inbound_id;
  if (!inboundId) {
    return NextResponse.json({ error: "missing_inbound_id" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: inbound, error: inboundError } = await supabase
    .from("inbound_messages")
    .select("id,account_id,lead_id,campaign_id,identity_id,received_at")
    .eq("id", inboundId)
    .maybeSingle();

  if (inboundError) {
    console.error("Failed to load inbound for mark-replied", inboundError);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }

  if (!inbound) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (inbound.lead_id) {
    const { error: leadUpdateError } = await supabase
      .from("leads")
      .update({ last_replied_at: inbound.received_at })
      .eq("id", inbound.lead_id)
      .is("last_replied_at", null);

    if (leadUpdateError) {
      console.error("Failed to update lead last_replied_at", leadUpdateError);
      return NextResponse.json({ error: "lead_update_failed" }, { status: 500 });
    }
  }

  if (inbound.lead_id && inbound.campaign_id) {
    const { error: campaignUpdateError } = await supabase
      .from("campaign_targets")
      .update({ replied: true })
      .eq("campaign_id", inbound.campaign_id)
      .eq("lead_id", inbound.lead_id);

    if (campaignUpdateError) {
      console.error("Failed to update campaign target replied", campaignUpdateError);
      return NextResponse.json({ error: "campaign_update_failed" }, { status: 500 });
    }
  }

  const { error: logError } = await supabase.rpc("log_reply_activity", {
    p_account: inbound.account_id,
    p_lead: inbound.lead_id,
    p_identity: inbound.identity_id,
    p_campaign: inbound.campaign_id,
    p_inbound: inbound.id,
  });

  if (logError) {
    console.error("Failed to log reply activity", logError);
  }

  return NextResponse.json({ ok: true });
}

