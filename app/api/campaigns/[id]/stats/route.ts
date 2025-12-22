// app/api/campaigns/[id]/stats/route.ts
// Block 16900 — Campaign Performance Dashboard v1
// Returns stats for one campaign: emails sent/delivered/opened/replied, hot leads, unsubscribes, estimated pipeline value

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const campaignId = params.id;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace for campaign & check membership
  const { data: campaign, error: campError } = await supabase
    .from("campaigns")
    .select("id, workspace_id, name, status")
    .eq("id", campaignId)
    .single();

  if (campError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const { data: member, error: memberError } = await supabase
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", campaign.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberError || !member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Outbound sent messages for this campaign
  // Handle both 'outbound' and 'out' direction values
  const { data: outbound, error: outError } = await supabase
    .from("email_messages")
    .select("id, status, opened_at, contact_id")
    .eq("campaign_id", campaignId)
    .in("direction", ["outbound", "out"]);

  if (outError) {
    return NextResponse.json({ error: outError.message }, { status: 400 });
  }

  const sent = outbound?.length || 0;
  const delivered = outbound?.filter(
    (m) => m.status === "sent"
  ).length || 0;
  const opened = outbound?.filter((m) => m.opened_at).length || 0;

  const contactIds = Array.from(
    new Set(outbound?.map((m) => m.contact_id).filter(Boolean) || [])
  );

  // Inbound replies & intents
  // Handle both 'inbound' and 'in' direction values
  const { data: inbound, error: inError } = await supabase
    .from("email_messages")
    .select("id, contact_id, intent_label")
    .eq("campaign_id", campaignId)
    .in("direction", ["inbound", "in"]);

  if (inError) {
    return NextResponse.json({ error: inError.message }, { status: 400 });
  }

  const replies = inbound?.length || 0;
  const hotLeads = inbound?.filter(
    (m) => m.intent_label === "hot_lead"
  ).length || 0;
  const warmLeads = inbound?.filter(
    (m) => m.intent_label === "warm_lead"
  ).length || 0;
  const unsubscribes = inbound?.filter(
    (m) => m.intent_label === "unsubscribe"
  ).length || 0;

  // Estimate pipeline value from contacts touched by this campaign
  let estValue = 0;
  if (contactIds.length > 0) {
    const { data: contacts, error: cError } = await supabase
      .from("contacts")
      .select("est_job_value")
      .in("id", contactIds);

    if (!cError && contacts) {
      estValue = contacts.reduce(
        (sum, c) => sum + Number(c.est_job_value || 0),
        0
      );
    }
  }

  const openRate = sent > 0 ? opened / sent : 0;
  const replyRate = sent > 0 ? replies / sent : 0;
  const hotRate = sent > 0 ? hotLeads / sent : 0;

  return NextResponse.json({
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
    },
    stats: {
      sent,
      delivered,
      opened,
      replies,
      hotLeads,
      warmLeads,
      unsubscribes,
      openRate,
      replyRate,
      hotRate,
      estValue,
    },
  });
}
