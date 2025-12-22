import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/inbox/owner/money-metrics
 * Fetch money metrics for the Money Meter:
 * - Booked Revenue (Last 30 Days): Sum of booked conversions
 * - Pipeline Value (Projected): Sum of estimated_value × probability
 * - Jobs Booked via Inbox: Count of booked estimates logged through Inbox
 */
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

    // Calculate date 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

    // Get user's accessible campaigns
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
        bookedRevenue: 0,
        pipelineValue: 0,
        jobsBooked: 0,
        activeJobsInConversation: 0,
        cushionDays: 0,
      });
    }

    // 1. Booked Revenue (Last 30 Days)
    // Sum of estimated_value for jobs_conversions where conversion_type = 'won_job' OR pipeline_stage = 'won'
    // AND created_at >= 30 days ago
    const { data: bookedConversions } = await supabase
      .from("jobs_conversions")
      .select("estimated_value, pipeline_stage, conversion_type")
      .in("campaign_id", campaignIds)
      .gte("created_at", thirtyDaysAgoISO)
      .or("conversion_type.eq.won_job,pipeline_stage.eq.won");

    const bookedRevenue = bookedConversions?.reduce((sum, conv) => {
      return sum + (conv.estimated_value ? Number(conv.estimated_value) : 0);
    }, 0) || 0;

    // 2. Pipeline Value (Projected)
    // Sum of estimated_value × (probability / 100) for all jobs_conversions
    // where pipeline_stage IN ('booked', 'pending') AND created_at >= 30 days ago
    const { data: pipelineConversions } = await supabase
      .from("jobs_conversions")
      .select("estimated_value, probability")
      .in("campaign_id", campaignIds)
      .in("pipeline_stage", ["booked", "pending"])
      .gte("created_at", thirtyDaysAgoISO);

    const pipelineValue = pipelineConversions?.reduce((sum, conv) => {
      const value = conv.estimated_value ? Number(conv.estimated_value) : 0;
      const prob = conv.probability ? Number(conv.probability) / 100 : 0.8; // Default 80% if not set
      return sum + (value * prob);
    }, 0) || 0;

    const activeJobsInConversation = (pipelineConversions || []).length;

    // 3. Jobs Booked via Inbox (Last 30 Days)
    // Count of jobs_conversions where conversion_type = 'booked_estimate'
    // AND created_at >= 30 days ago
    const { count: jobsBooked } = await supabase
      .from("jobs_conversions")
      .select("*", { count: "exact", head: true })
      .in("campaign_id", campaignIds)
      .eq("conversion_type", "booked_estimate")
      .gte("created_at", thirtyDaysAgoISO);

    const dailyRunRate = bookedRevenue > 0 ? bookedRevenue / 30 : 0;
    const cushionDays =
      dailyRunRate > 0 ? Math.round(pipelineValue / dailyRunRate) : 0;

    return NextResponse.json({
      bookedRevenue: Math.round(bookedRevenue),
      pipelineValue: Math.round(pipelineValue),
      jobsBooked: jobsBooked || 0,
      activeJobsInConversation,
      cushionDays,
    });
  } catch (error) {
    console.error("Error fetching money metrics:", error);
    return NextResponse.json(
      { error: "Failed to fetch money metrics" },
      { status: 500 }
    );
  }
}



















































