import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/inbox/owner/metrics
 * Fetch inbox metrics for the last 7 days:
 * - Replies Received
 * - Hot Leads
 * - Booked Estimates
 * - Estimated Pipeline Value
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

    // Calculate date 7 days ago
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoISO = sevenDaysAgo.toISOString();

    // Calculate date 30 days ago for pipeline value (optional)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

    // Get user's accessible campaigns (through workspace membership)
    // First, get workspace_id from user
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .single();

    if (!membership?.workspace_id) {
      // Fallback: try to get campaigns directly owned by user
      const { data: userCampaigns } = await supabase
        .from("campaigns")
        .select("id")
        .eq("user_id", user.id);

      if (!userCampaigns || userCampaigns.length === 0) {
        return NextResponse.json({
          repliesReceived: 0,
          hotLeads: 0,
          bookedEstimates: 0,
          estimatedPipelineValue: 0,
        });
      }

      const campaignIds = userCampaigns.map((c) => c.id);

      // 1. Replies Received (last 7 days)
      // Count inbox_messages (all inbound replies)
      const { count: repliesCount } = await supabase
        .from("inbox_messages")
        .select("*", { count: "exact", head: true })
        .in("campaign_id", campaignIds)
        .gte("received_at", sevenDaysAgoISO);

      // 2. Hot Leads (last 7 days)
      // Count distinct inbox_threads with ai_overall_intent = 'hot'
      const { count: hotLeadsCount } = await supabase
        .from("inbox_threads")
        .select("*", { count: "exact", head: true })
        .in("campaign_id", campaignIds)
        .eq("ai_overall_intent", "hot")
        .gte("last_message_at", sevenDaysAgoISO);

      // 3. Booked Estimates (last 7 days)
      // Count jobs_conversions where conversion_type = 'booked_estimate'
      const { count: bookedCount } = await supabase
        .from("jobs_conversions")
        .select("*", { count: "exact", head: true })
        .in("campaign_id", campaignIds)
        .eq("conversion_type", "booked_estimate")
        .gte("created_at", sevenDaysAgoISO);

      // 4. Estimated Pipeline Value (last 30 days)
      // Sum of estimated_value for jobs_conversions
      const { data: conversions } = await supabase
        .from("jobs_conversions")
        .select("estimated_value")
        .in("campaign_id", campaignIds)
        .gte("created_at", thirtyDaysAgoISO);

      const pipelineValue = conversions?.reduce((sum, conv) => {
        return sum + (conv.estimated_value ? Number(conv.estimated_value) : 0);
      }, 0) || 0;

      return NextResponse.json({
        repliesReceived: repliesCount || 0,
        hotLeads: hotLeadsCount || 0,
        bookedEstimates: bookedCount || 0,
        estimatedPipelineValue: pipelineValue,
      });
    }

    // Get campaigns for workspace
    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("id")
      .eq("workspace_id", membership.workspace_id);

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({
        repliesReceived: 0,
        hotLeads: 0,
        bookedEstimates: 0,
        estimatedPipelineValue: 0,
      });
    }

    const campaignIds = campaigns.map((c) => c.id);

    // 1. Replies Received (last 7 days)
    // Count inbox_messages (all inbound replies)
    const { count: repliesCount } = await supabase
      .from("inbox_messages")
      .select("*", { count: "exact", head: true })
      .in("campaign_id", campaignIds)
      .gte("received_at", sevenDaysAgoISO);

    // 2. Hot Leads (last 7 days)
    // Count distinct inbox_threads with ai_overall_intent = 'hot'
    const { count: hotLeadsCount } = await supabase
      .from("inbox_threads")
      .select("*", { count: "exact", head: true })
      .in("campaign_id", campaignIds)
      .eq("ai_overall_intent", "hot")
      .gte("last_message_at", sevenDaysAgoISO);

    // 3. Booked Estimates (last 7 days)
    // Count jobs_conversions where conversion_type = 'booked_estimate'
    const { count: bookedCount } = await supabase
      .from("jobs_conversions")
      .select("*", { count: "exact", head: true })
      .in("campaign_id", campaignIds)
      .eq("conversion_type", "booked_estimate")
      .gte("created_at", sevenDaysAgoISO);

    // 4. Estimated Pipeline Value (last 30 days)
    // Sum of estimated_value for jobs_conversions
    const { data: conversions } = await supabase
      .from("jobs_conversions")
      .select("estimated_value")
      .in("campaign_id", campaignIds)
      .gte("created_at", thirtyDaysAgoISO);

    const pipelineValue = conversions?.reduce((sum, conv) => {
      return sum + (conv.estimated_value ? Number(conv.estimated_value) : 0);
    }, 0) || 0;

    return NextResponse.json({
      repliesReceived: repliesCount || 0,
      hotLeads: hotLeadsCount || 0,
      bookedEstimates: bookedCount || 0,
      estimatedPipelineValue: pipelineValue,
    });
  } catch (error) {
    console.error("Error fetching inbox metrics:", error);
    return NextResponse.json(
      { error: "Failed to fetch metrics" },
      { status: 500 }
    );
  }
}

