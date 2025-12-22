// app/api/owner/overview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const ownerId = user.id;

  // Time window: current month
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const periodStartIso = periodStart.toISOString();
  const periodEndIso = periodEnd.toISOString();

  // Today
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const todayStartIso = todayStart.toISOString();
  const todayEndIso = todayEnd.toISOString();

  // Emails sent this period
  const { count: emailsSent } = await supabase
    .from("outbound_emails")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .eq("status", "sent")
    .gte("sent_at", periodStartIso)
    .lt("sent_at", periodEndIso);

  // Replies this period (using received_at for inbound_emails)
  const { count: repliesCount } = await supabase
    .from("inbound_emails")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .gte("received_at", periodStartIso)
    .lt("received_at", periodEndIso);

  // Hot leads (unique leads with classification 'hot' this period)
  const { data: hotRows } = await supabase
    .from("inbound_emails")
    .select("lead_id, classification, received_at")
    .eq("owner_id", ownerId)
    .eq("classification", "hot")
    .gte("received_at", periodStartIso)
    .lt("received_at", periodEndIso)
    .not("lead_id", "is", null);

  const hotLeadIds = new Set<string>();
  for (const row of hotRows ?? []) {
    if (row.lead_id) hotLeadIds.add(row.lead_id as string);
  }
  const hot_leads = hotLeadIds.size;

  // Jobs won + revenue this period
  const { data: wonRows } = await supabase
    .from("leads")
    .select("won_value, won_at, owner_id")
    .eq("owner_id", ownerId)
    .eq("outcome", "won")
    .gte("won_at", periodStartIso)
    .lt("won_at", periodEndIso);

  const jobs_won = wonRows?.length ?? 0;
  const revenue_won =
    wonRows?.reduce(
      (sum: number, row: any) => sum + Number(row.won_value || 0),
      0
    ) ?? 0;

  // New replies today
  const { count: newRepliesToday } = await supabase
    .from("inbound_emails")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .gte("received_at", todayStartIso)
    .lt("received_at", todayEndIso);

  // New hot leads today
  const { data: hotTodayRows } = await supabase
    .from("inbound_emails")
    .select("lead_id")
    .eq("owner_id", ownerId)
    .eq("classification", "hot")
    .gte("received_at", todayStartIso)
    .lt("received_at", todayEndIso)
    .not("lead_id", "is", null);

  const hotTodayIds = new Set<string>();
  for (const row of hotTodayRows ?? []) {
    if (row.lead_id) hotTodayIds.add(row.lead_id as string);
  }
  const new_hot_today = hotTodayIds.size;

  // Follow-ups due today
  const { count: followupsDueToday } = await supabase
    .from("lead_tasks")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .eq("status", "open")
    .gte("due_at", todayStartIso)
    .lt("due_at", todayEndIso);

  // Total open followups
  const { count: openFollowups } = await supabase
    .from("lead_tasks")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .eq("status", "open");

  // Top campaigns by revenue_won (sum of won_value)
  const { data: topCampaignsRaw } = await supabase
    .from("leads")
    .select("campaign_id, won_value")
    .eq("owner_id", ownerId)
    .eq("outcome", "won")
    .gte("won_at", periodStartIso)
    .lt("won_at", periodEndIso);

  const revenueByCampaign = new Map<string, number>();
  for (const row of topCampaignsRaw ?? []) {
    if (!row.campaign_id) continue;
    const current = revenueByCampaign.get(row.campaign_id) ?? 0;
    revenueByCampaign.set(
      row.campaign_id,
      current + Number(row.won_value || 0)
    );
  }

  const topCampaignIds = Array.from(revenueByCampaign.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([campaign_id]) => campaign_id);

  let top_campaigns: any[] = [];

  if (topCampaignIds.length > 0) {
    const { data: campaignRows } = await supabase
      .from("campaigns")
      .select("id, name")
      .in("id", topCampaignIds);

    top_campaigns = (campaignRows ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      revenue_won: revenueByCampaign.get(c.id) ?? 0,
    }));
  }

  return NextResponse.json(
    {
      period: {
        start: periodStartIso,
        end: periodEndIso,
      },
      summary: {
        emails_sent: emailsSent ?? 0,
        replies: repliesCount ?? 0,
        hot_leads,
        jobs_won,
        revenue_won,
      },
      today: {
        new_replies_today: newRepliesToday ?? 0,
        new_hot_today,
        followups_due_today: followupsDueToday ?? 0,
      },
      followups_open: openFollowups ?? 0,
      top_campaigns,
    },
    { status: 200 }
  );
}

