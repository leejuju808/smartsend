// app/api/dashboard/campaigns/route.ts
// Block 8990 — Simple Revenue & Reply Dashboard v1
// Per-campaign breakdown

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const accountId = user.id;

  // Parse range parameter: 7d, 30d, or all
  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") || "7d";
  
  const now = new Date();
  let from: Date;
  let to: Date = now;
  
  if (range === "7d") {
    from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (range === "30d") {
    from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else {
    // all time - use account.created_at
    const { data: accountData } = await supabase
      .from("profiles")
      .select("created_at")
      .eq("id", accountId)
      .single();
    from = accountData?.created_at ? new Date(accountData.created_at) : new Date(0);
  }

  try {
    // Get all campaigns for this account
    const { data: campaigns, error: campaignsError } = await supabase
      .from("campaigns")
      .select("id, name")
      .eq("account_id", accountId);

    if (campaignsError || !campaigns || campaigns.length === 0) {
      return NextResponse.json({ campaigns: [] });
    }

    const campaignResults = await Promise.all(
      campaigns.map(async (campaign) => {
        const campaignId = campaign.id;

        // 1. Emails Sent - Count of outbound messages for this campaign in range
        const { count: emailsSent } = await supabase
          .from("messages")
          .select("id", { head: true, count: "exact" })
          .eq("account_id", accountId)
          .eq("campaign_id", campaignId)
          .eq("direction", "outbound")
          .gte("created_at", from.toISOString())
          .lte("created_at", to.toISOString());

        // 2. Replies Received - Count of inbound messages for this campaign in range
        const { count: repliesReceived } = await supabase
          .from("messages")
          .select("id", { head: true, count: "exact" })
          .eq("account_id", accountId)
          .eq("campaign_id", campaignId)
          .eq("direction", "inbound")
          .gte("created_at", from.toISOString())
          .lte("created_at", to.toISOString());

        // 3. Positive Replies (Hot + Warm) - Count where latest intent in range is hot or warm
        const { count: positiveReplies } = await supabase
          .from("lead_auto_follow_up_stats")
          .select("id", { head: true, count: "exact" })
          .eq("account_id", accountId)
          .eq("campaign_id", campaignId)
          .in("lead_status", ["hot", "warm"])
          .gte("last_inbound_at", from.toISOString())
          .lte("last_inbound_at", to.toISOString());

        // 4. Hot Leads - Count of leads with lead_status = 'hot' for this campaign
        const { count: hotLeads } = await supabase
          .from("lead_auto_follow_up_stats")
          .select("id", { head: true, count: "exact" })
          .eq("account_id", accountId)
          .eq("campaign_id", campaignId)
          .eq("lead_status", "hot")
          .gte("last_inbound_at", from.toISOString())
          .lte("last_inbound_at", to.toISOString());

        // 5. Jobs Won - Count of leads where pipeline_stage = 'won' for this campaign
        const { count: jobsWon } = await supabase
          .from("lead_auto_follow_up_stats")
          .select("id", { head: true, count: "exact" })
          .eq("account_id", accountId)
          .eq("campaign_id", campaignId)
          .eq("pipeline_stage", "won")
          .gte("updated_at", from.toISOString())
          .lte("updated_at", to.toISOString());

        // 6. Estimated Revenue (Jobs Won) - Sum of closed_job_value if not null, else potential_job_value
        const { data: wonRevenueData } = await supabase
          .from("lead_auto_follow_up_stats")
          .select("closed_job_value, potential_job_value")
          .eq("account_id", accountId)
          .eq("campaign_id", campaignId)
          .eq("pipeline_stage", "won")
          .gte("updated_at", from.toISOString())
          .lte("updated_at", to.toISOString());

        const estimatedRevenueWon = wonRevenueData?.reduce((sum, row) => {
          const value = row.closed_job_value ?? row.potential_job_value ?? 0;
          return sum + Number(value);
        }, 0) ?? 0;

        return {
          campaign_id: campaignId,
          name: campaign.name,
          emails_sent: emailsSent ?? 0,
          replies_received: repliesReceived ?? 0,
          positive_replies: positiveReplies ?? 0,
          hot_leads: hotLeads ?? 0,
          jobs_won: jobsWon ?? 0,
          estimated_revenue_won: estimatedRevenueWon,
        };
      })
    );

    return NextResponse.json({ campaigns: campaignResults });
  } catch (err) {
    console.error("Error building campaigns dashboard:", err);
    return NextResponse.json(
      { error: "Failed to load campaigns dashboard" },
      { status: 500 }
    );
  }
}

