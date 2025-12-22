// Block 20150 — Inbox Campaign Performance Summary
// Campaign Performance Summary (Inbox-Driven)

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
      return NextResponse.json({ campaigns: [] });
    }

    // 1) Get all campaigns for this workspace
    const { data: campaigns, error: campError } = await supabase
      .from("campaigns")
      .select("id, name, title")
      .eq("workspace_id", workspaceId);

    if (campError) {
      console.error("Campaign fetch error", campError);
      return NextResponse.json({ error: "Failed to load campaigns" }, { status: 500 });
    }

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({ campaigns: [] });
    }

    const campaignIds = campaigns.map((c) => c.id);

    // 2) Pull all inbox_threads tied to these campaigns via source_campaign_id
    const { data: threads, error: threadError } = await supabase
      .from("inbox_threads")
      .select(`
        id,
        source_campaign_id,
        lead_stage,
        pipeline_stage,
        estimated_job_value,
        actual_job_value
      `)
      .in("source_campaign_id", campaignIds);

    if (threadError) {
      console.error("Inbox threads error", threadError);
      return NextResponse.json({ error: "Failed to load campaign inbox data" }, { status: 500 });
    }

    // 3) Aggregate stats per campaign
    const statsMap: Record<
      string,
      {
        campaign_id: string;
        campaign_name: string;
        total_leads: number;
        won_jobs: number;
        pipeline_estimated: number;
        revenue_closed: number;
      }
    > = {};

    // Initialize stats for all campaigns
    for (const camp of campaigns) {
      const campaignName = camp.name || camp.title || "Unnamed Campaign";
      statsMap[camp.id] = {
        campaign_id: camp.id,
        campaign_name: campaignName,
        total_leads: 0,
        won_jobs: 0,
        pipeline_estimated: 0,
        revenue_closed: 0,
      };
    }

    // Aggregate stats from threads
    for (const thread of threads || []) {
      const campaignId = thread.source_campaign_id;
      if (!campaignId || !statsMap[campaignId]) continue;

      const bucket = statsMap[campaignId];
      bucket.total_leads += 1;

      // Check both lead_stage and pipeline_stage for "won"
      const stage = thread.lead_stage || thread.pipeline_stage;
      const est = thread.estimated_job_value || 0;
      const act = thread.actual_job_value || 0;

      if (stage === "won") {
        bucket.won_jobs += 1;
        bucket.revenue_closed += act;
      } else if (stage !== "lost") {
        // Open pipeline (not won/lost)
        bucket.pipeline_estimated += est;
      }
    }

    // Convert to array and sort by revenue_closed descending
    const result = Object.values(statsMap).sort(
      (a, b) => b.revenue_closed - a.revenue_closed
    );

    return NextResponse.json({ campaigns: result });
  } catch (error: any) {
    console.error("Error in campaign-summary API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

















































