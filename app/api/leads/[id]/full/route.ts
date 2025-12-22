import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createClient();
  const { id } = await params;
  const leadId = id;

  // Lead core
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();

  if (leadErr || !lead) {
    return NextResponse.json({ error: "lead_not_found" }, { status: 404 });
  }

  // Replies for this lead (newest first)
  const { data: replies } = await supabase
    .from("inbox_replies_view")
    .select("*")
    .eq("lead_id", leadId)
    .order("received_at", { ascending: false })
    .limit(50);

  // Meetings for this lead
  const { data: meetings } = await supabase
    .from("meeting_pipeline_view")
    .select("*")
    .eq("lead_id", leadId)
    .order("start_time", { ascending: true });

  // Activity for this lead
  const { data: activity } = await supabase
    .from("workspace_activity_view")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(50);

  // Campaigns lead is in
  const { data: campLeads } = await supabase
    .from("campaign_leads")
    .select("campaign_id, status, created_at")
    .eq("lead_id", leadId);

  let campaigns: any[] = [];
  if (campLeads && campLeads.length > 0) {
    const ids = campLeads.map((cl) => cl.campaign_id);
    const { data: campaignRows } = await supabase
      .from("campaigns")
      .select("id, name")
      .in("id", ids);

    const byId = new Map<string, any>();
    (campaignRows || []).forEach((c) => byId.set(c.id, c));
    campaigns = campLeads.map((cl) => ({
      ...cl,
      campaign: byId.get(cl.campaign_id) || null,
    }));
  }

  return NextResponse.json(
    {
      lead,
      replies: replies || [],
      meetings: meetings || [],
      activity: activity || [],
      campaigns,
    },
    { status: 200 }
  );
}

