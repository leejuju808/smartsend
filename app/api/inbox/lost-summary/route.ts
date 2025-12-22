// Block 20230 — Lost Reason Summary API

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get user's workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    let workspaceId: string | null = null;
    if (membership?.workspace_id) {
      workspaceId = membership.workspace_id;
    } else {
      // Fallback: try to get workspace from campaigns via user_id
      const { data: userCampaigns } = await supabase
        .from("campaigns")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .single();
      workspaceId = userCampaigns?.workspace_id || null;
    }

    if (!workspaceId) {
      return NextResponse.json({ reasons: [], competitors: [] });
    }

    // Get all campaigns for this workspace
    const { data: campaigns, error: campError } = await supabase
      .from("campaigns")
      .select("id")
      .eq("workspace_id", workspaceId);

    if (campError) {
      console.error("Campaign fetch error", campError);
      return NextResponse.json({ error: "Failed to load campaigns" }, { status: 500 });
    }

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ reasons: [], competitors: [] });
    }

    const campaignIds = campaigns.map((c) => c.id);

    // Get all lost threads for these campaigns
    // Query by campaign_id (base field) - threads may also have source_campaign_id
    const { data, error } = await supabase
      .from("inbox_threads")
      .select(
        `
        id,
        lost_reason_category,
        lost_to_competitor_name,
        lost_to_competitor_bid
      `
      )
      .in("campaign_id", campaignIds)
      .eq("lead_stage", "lost");

    if (error) {
      console.error("Lost summary error", error);
      return NextResponse.json(
        { error: "Failed to load lost summary" },
        { status: 500 }
      );
    }

    const reasonCounts: Record<string, number> = {};
    const competitorCounts: Record<
      string,
      { count: number; avgBid: number; totalBid: number }
    > = {};

    for (const row of data || []) {
      const reason = row.lost_reason_category || "unknown";
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;

      const compName = row.lost_to_competitor_name?.trim();
      if (compName) {
        if (!competitorCounts[compName]) {
          competitorCounts[compName] = { count: 0, avgBid: 0, totalBid: 0 };
        }
        competitorCounts[compName].count += 1;
        if (row.lost_to_competitor_bid != null) {
          competitorCounts[compName].totalBid += Number(
            row.lost_to_competitor_bid
          );
        }
      }
    }

    // compute average bids
    Object.keys(competitorCounts).forEach((name) => {
      const entry = competitorCounts[name];
      if (entry.totalBid > 0 && entry.count > 0) {
        entry.avgBid = entry.totalBid / entry.count;
      }
    });

    const reasons = Object.entries(reasonCounts)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);

    const competitors = Object.entries(competitorCounts)
      .map(([name, info]) => ({
        name,
        count: info.count,
        avgBid: info.avgBid,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return NextResponse.json({ reasons, competitors });
  } catch (error: any) {
    console.error("Error in lost-summary API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

