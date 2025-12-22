// Block 20080 — Inbox Summary API (Owner HUD)
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

    // Get user's workspace/campaigns
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .single();

    let campaignIds: string[] = [];

    if (membership?.workspace_id) {
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id")
        .eq("workspace_id", membership.workspace_id);
      campaignIds = campaigns?.map((c) => c.id) || [];
    } else {
      // Fallback: user-owned campaigns
      const { data: userCampaigns } = await supabase
        .from("campaigns")
        .select("id")
        .eq("user_id", user.id);
      campaignIds = userCampaigns?.map((c) => c.id) || [];
    }

    if (campaignIds.length === 0) {
      return NextResponse.json({
        open_leads: 0,
        hot_leads: 0,
        due_now: 0,
        pipeline_estimated: 0,
        closed_this_month: 0,
      });
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    // 1) Open leads (not won/lost)
    // Check both lead_stage and pipeline_stage fields
    const { data: openLeads, error: openError } = await supabase
      .from("inbox_threads")
      .select("id, engagement_level, thread_estimated_value, next_action_at, lead_stage, pipeline_stage")
      .in("campaign_id", campaignIds)
      .neq("lead_stage", "won")
      .neq("lead_stage", "lost")
      .neq("pipeline_stage", "won")
      .neq("pipeline_stage", "lost");

    if (openError) {
      console.error("Inbox summary open error", openError);
      return NextResponse.json(
        { error: "Failed to load summary" },
        { status: 500 }
      );
    }

    // Filter out won/lost threads (check both lead_stage and pipeline_stage)
    const openLeadsFiltered = (openLeads || []).filter(
      (t) =>
        t.lead_stage !== "won" &&
        t.lead_stage !== "lost" &&
        t.pipeline_stage !== "won" &&
        t.pipeline_stage !== "lost"
    );

    // 2) Jobs won this month
    // Check both lead_stage and pipeline_stage, and use updated_at as close_date proxy
    // We need to get threads where either lead_stage OR pipeline_stage is 'won'
    const { data: wonThisMonth, error: wonError } = await supabase
      .from("inbox_threads")
      .select("thread_estimated_value, updated_at, lead_stage, pipeline_stage")
      .in("campaign_id", campaignIds)
      .gte("updated_at", monthStart.toISOString())
      .lte("updated_at", monthEnd.toISOString());

    if (wonError) {
      console.error("Inbox summary won error", wonError);
      return NextResponse.json(
        { error: "Failed to load summary" },
        { status: 500 }
      );
    }

    // Filter won threads (either lead_stage or pipeline_stage is 'won')
    const wonThreads = (wonThisMonth || []).filter(
      (t) => t.lead_stage === "won" || t.pipeline_stage === "won"
    );

    const openCount = openLeadsFiltered.length;
    const hotCount = openLeadsFiltered.filter(
      (c) => c.engagement_level === "hot"
    ).length;

    // Follow-ups due now (overdue + today)
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const dueNow = openLeadsFiltered.filter((c) => {
      if (!c.next_action_at) return false;
      const d = new Date(c.next_action_at);
      return d <= todayEnd;
    }).length;

    // Pipeline value (sum of thread_estimated_value for open leads)
    const pipelineEstimated = openLeadsFiltered
      .map((c) => Number(c.thread_estimated_value) || 0)
      .reduce((acc, v) => acc + v, 0);

    // Closed revenue this month (use thread_estimated_value as actual_job_value proxy)
    const closedThisMonth = wonThreads
      .map((r) => Number(r.thread_estimated_value) || 0)
      .reduce((acc, v) => acc + v, 0);

    return NextResponse.json({
      open_leads: openCount,
      hot_leads: hotCount,
      due_now: dueNow,
      pipeline_estimated: pipelineEstimated,
      closed_this_month: closedThisMonth,
    });
  } catch (error: any) {
    console.error("Error in inbox summary API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

