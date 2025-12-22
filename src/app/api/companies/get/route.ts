import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("id");

  if (!companyId) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "no workspace" }, { status: 401 });
  }

  // Get company
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .eq("workspace_id", workspaceId)
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Get leads for this company
  const { data: leads, error: leadsError } = await supabase
    .from("leads")
    .select("id, first_name, last_name, email, title, status, owner_id")
    .eq("company_id", companyId)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (leadsError) {
    return NextResponse.json(
      { error: leadsError.message },
      { status: 500 }
    );
  }

  const leadIds = (leads || []).map((l: any) => l.id);

  // Get deals for this company (via lead_ids)
  const { data: deals, error: dealsError } = await supabase
    .from("deals")
    .select("id, title, stage, value, owner_id, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .in("lead_id", leadIds.length > 0 ? leadIds : [null])
    .order("updated_at", { ascending: false });

  if (dealsError) {
    console.error("Error fetching deals:", dealsError);
  }

  // Get company activity (aggregated from lead_activity and deal_activity)
  const { data: leadActivities, error: activitiesError } = await supabase
    .from("lead_activity")
    .select("*")
    .in("lead_id", leadIds.length > 0 ? leadIds : [null])
    .order("occurred_at", { ascending: false })
    .limit(500);

  // Get deal activities
  const dealIds = (deals || []).map((d: any) => d.id);
  let dealActivities: any[] = [];
  if (dealIds.length > 0) {
    const { data } = await supabase
      .from("deal_activity")
      .select("*")
      .in("deal_id", dealIds)
      .order("created_at", { ascending: false })
      .limit(500);
    dealActivities = data || [];
  }

  // Combine and sort activities
  const allActivities = [
    ...(leadActivities || []).map((a: any) => ({
      ...a,
      activity_type: 'lead',
      occurred_at: a.occurred_at,
    })),
    ...(dealActivities || []).map((a: any) => ({
      ...a,
      activity_type: 'deal',
      occurred_at: a.created_at,
    })),
  ].sort((a, b) => 
    new Date(b.occurred_at || b.created_at).getTime() - 
    new Date(a.occurred_at || a.created_at).getTime()
  ).slice(0, 500);

  // Get stats for overview
  const openDeals = (deals || []).filter((d: any) => 
    !['closed_won', 'closed_lost'].includes(d.stage)
  );
  const openDealsValue = openDeals.reduce((sum: number, d: any) => sum + (d.value || 0), 0);

  // Get engagement metrics from message_logs or send_logs
  const { data: sentLogs } = await supabase
    .from("send_logs")
    .select("id, status")
    .in("lead_id", leadIds.length > 0 ? leadIds : [null])
    .eq("status", "sent");

  const sentCount = (sentLogs || []).length;

  const { data: opens } = await supabase
    .from("lead_activity")
    .select("id")
    .in("lead_id", leadIds.length > 0 ? leadIds : [null])
    .eq("type", "email_open");

  const openCount = (opens || []).length;
  const openRate = sentCount > 0 ? openCount / sentCount : 0;

  const { data: replies } = await supabase
    .from("lead_activity")
    .select("id")
    .in("lead_id", leadIds.length > 0 ? leadIds : [null])
    .eq("type", "reply");

  const replyCount = (replies || []).length;
  const replyRate = sentCount > 0 ? replyCount / sentCount : 0;

  // Get last activity dates
  const lastOutbound = allActivities.find((a: any) => 
    a.type === 'email_sent' || (a.activity_type === 'lead' && a.type === 'email_sent')
  );
  const lastReply = allActivities.find((a: any) => 
    a.type === 'reply' || (a.activity_type === 'lead' && a.type === 'reply')
  );
  const lastDealUpdate = deals && deals.length > 0 
    ? deals[0].updated_at 
    : null;

  return NextResponse.json({
    company,
    leads: leads || [],
    deals: deals || [],
    activities: allActivities,
    stats: {
      total_leads: leads?.length || 0,
      high_intent_leads: (leads || []).filter((l: any) => 
        ['replied', 'high_intent'].includes(l.status)
      ).length,
      open_deals_count: openDeals.length,
      open_deals_value: openDealsValue,
      sent_count: sentCount,
      open_rate: openRate,
      reply_rate: replyRate,
      last_outbound_email: lastOutbound?.occurred_at || null,
      last_reply: lastReply?.occurred_at || null,
      last_deal_update: lastDealUpdate,
    },
  });
}

