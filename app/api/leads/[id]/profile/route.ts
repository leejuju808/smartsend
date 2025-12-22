import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createClient();
  const { id } = await params;
  const leadId = id;

  // Get authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 1) Load lead
  // RLS policies will handle access control
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .maybeSingle();

  if (leadErr || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Get campaign name from campaign_leads if campaign_id is not directly on lead
  let campaignName: string | null = null;
  if (lead.campaign_id) {
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("name")
      .eq("id", lead.campaign_id)
      .maybeSingle();
    campaignName = campaign?.name || null;
  } else {
    // Try to get from campaign_leads
    const { data: campaignLead } = await supabase
      .from("campaign_leads")
      .select("campaigns:campaign_id ( name )")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    campaignName = (campaignLead as any)?.campaigns?.name || null;
  }

  // Attach campaign name to lead object for consistency
  const leadWithCampaign = {
    ...lead,
    campaigns: campaignName ? { name: campaignName } : null,
  };

  // 2) Last 5 timeline events using RPC function
  let timelineEvents: any[] = [];
  try {
    const { data: events, error: rpcError } = await supabase
      .rpc("lead_timeline_last5", { p_lead_id: leadId });

    if (rpcError) {
      console.warn("Could not fetch timeline events via RPC:", rpcError);
      // Fallback to empty array
    } else {
      timelineEvents = (events || []).map((ev: any) => ({
        type: ev.type === "outbound_email" ? "email_sent" : ev.type === "inbound_email" ? "reply" : ev.type,
        summary: ev.summary || "",
        created_at: ev.created_at,
      }));
    }
  } catch (err) {
    // RPC might not exist, continue without timeline events
    console.warn("Could not fetch timeline events:", err);
  }

  // 3) Open tasks
  const { data: tasks } = await supabase
    .from("lead_tasks")
    .select("id, title, due_at, status")
    .eq("lead_id", leadId)
    .eq("status", "open")
    .eq("owner_id", user.id)
    .order("due_at", { ascending: true });

  // 4) Last inbound & last outbound dates
  // Try multiple sources for inbound
  let lastInbound: string | null = null;
  
  const { data: lastInboundReply } = await supabase
    .from("inbound_replies")
    .select("created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (lastInboundReply?.[0]?.created_at) {
    lastInbound = lastInboundReply[0].created_at;
  } else {
    const { data: lastInboundMessage } = await supabase
      .from("replies")
      .select("received_at, created_at")
      .eq("lead_id", leadId)
      .order("received_at", { ascending: false })
      .limit(1);

    lastInbound = lastInboundMessage?.[0]?.received_at || 
                  lastInboundMessage?.[0]?.created_at || 
                  null;
  }

  // Try multiple sources for outbound
  let lastOutbound: string | null = null;
  
  // Try send_logs first (most common)
  const { data: lastSendLog } = await supabase
    .from("send_logs")
    .select("sent_at")
    .eq("lead_id", leadId)
    .order("sent_at", { ascending: false })
    .limit(1);

  if (lastSendLog?.[0]?.sent_at) {
    lastOutbound = lastSendLog[0].sent_at;
  } else if (lead.contact_id) {
    // Fallback to outbound_emails if contact_id exists
    const { data: lastOutboundEmail } = await supabase
      .from("outbound_emails")
      .select("sent_at, send_at, created_at")
      .eq("contact_id", lead.contact_id)
      .eq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(1);

    lastOutbound = lastOutboundEmail?.[0]?.sent_at || 
                   lastOutboundEmail?.[0]?.send_at || 
                   lastOutboundEmail?.[0]?.created_at ||
                   null;
  }

  return NextResponse.json(
    {
      lead: leadWithCampaign,
      events: timelineEvents,
      tasks: tasks || [],
      last_inbound: lastInbound,
      last_outbound: lastOutbound,
    },
    { status: 200 }
  );
}

