// app/api/campaigns/[id]/metrics/route.ts
// Block 8700 — Campaign Performance & Revenue Analytics
// Returns comprehensive campaign metrics: leads, replies, hot leads, jobs won, revenue, and step metrics

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

type StepMetric = {
  step_index: number;
  emails_sent: number;
};

type CampaignMetricsResponse = {
  leads_total: number;
  leads_active: number;
  emails_sent: number;
  replied_leads: number;
  hot_leads: number;
  jobs_won: number;
  revenue_won: number;
  step_metrics: StepMetric[];
};

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  const campaignId = params.id;

  // Ensure campaign belongs to user (check via workspace membership or owner_id)
  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .select("id, owner_id, workspace_id")
    .eq("id", campaignId)
    .maybeSingle();

  if (campErr || !campaign) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  // Check access: user must be owner or workspace member
  let hasAccess = false;
  
  if (campaign.owner_id === user.id) {
    hasAccess = true;
  } else if (campaign.workspace_id) {
    // Check workspace membership
    const { data: member } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", campaign.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();
    
    if (member) {
      hasAccess = true;
    } else {
      // Also check team_members
      const { data: teamMember } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("workspace_id", campaign.workspace_id)
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (teamMember) {
        hasAccess = true;
      }
    }
  }

  if (!hasAccess) {
    return NextResponse.json(
      { error: "Forbidden" },
      { status: 403 }
    );
  }

  // Leads total
  const { count: leadsTotal } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);

  // Leads active (status = 'active')
  const { count: leadsActive } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "active");

  // Emails sent for this campaign
  const { count: emailsSentCount } = await supabase
    .from("outbound_emails")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "sent");

  // Get all leads for this campaign
  const { data: campaignLeadIdsRows } = await supabase
    .from("leads")
    .select("id")
    .eq("campaign_id", campaignId);

  const campaignLeadIds = new Set(
    (campaignLeadIdsRows ?? []).map((r: any) => r.id as string)
  );

  // Unique leads that replied at least once
  // Get all inbound emails for the user/workspace, then filter by campaign leads
  const { data: repliedRows } = await supabase
    .from("inbound_emails")
    .select("lead_id")
    .not("lead_id", "is", null);

  // Filter to only replies from leads in this campaign
  const repliedLeadIds = new Set<string>();
  for (const row of repliedRows ?? []) {
    if (row.lead_id && campaignLeadIds.has(row.lead_id as string)) {
      repliedLeadIds.add(row.lead_id as string);
    }
  }

  const replied_leads = repliedLeadIds.size;

  // Hot leads (classification = hot)
  const { data: hotRows } = await supabase
    .from("inbound_emails")
    .select("lead_id, classification")
    .eq("classification", "hot")
    .not("lead_id", "is", null);

  const hotLeadIds = new Set<string>();
  for (const row of hotRows ?? []) {
    if (row.lead_id && campaignLeadIds.has(row.lead_id as string)) {
      hotLeadIds.add(row.lead_id as string);
    }
  }

  const hot_leads = hotLeadIds.size;

  // Jobs won + revenue from this campaign
  const { data: wonRows } = await supabase
    .from("leads")
    .select("id, won_value")
    .eq("campaign_id", campaignId)
    .eq("outcome", "won");

  const jobs_won = wonRows?.length ?? 0;
  const revenue_won =
    wonRows?.reduce(
      (sum: number, row: any) => sum + Number(row.won_value || 0),
      0
    ) ?? 0;

  // Per-step emails sent
  const { data: stepRows } = await supabase
    .from("outbound_emails")
    .select("step_index")
    .eq("campaign_id", campaignId)
    .eq("status", "sent");

  const stepCountMap = new Map<number, number>();
  for (const row of stepRows ?? []) {
    const idx = row.step_index ?? 0;
    stepCountMap.set(idx, (stepCountMap.get(idx) ?? 0) + 1);
  }

  const step_metrics: StepMetric[] = Array.from(stepCountMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([step_index, emails_sent]) => ({
      step_index,
      emails_sent,
    }));

  const resp: CampaignMetricsResponse = {
    leads_total: leadsTotal ?? 0,
    leads_active: leadsActive ?? 0,
    emails_sent: emailsSentCount ?? 0,
    replied_leads,
    hot_leads,
    jobs_won,
    revenue_won,
    step_metrics,
  };

  return NextResponse.json(resp, { status: 200 });
}

