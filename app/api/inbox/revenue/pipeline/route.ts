import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/inbox/revenue/pipeline
 * Fetch pipeline revenue totals by stage
 * Returns: totals grouped by pipeline_stage
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

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaign_id");

    if (!campaignId) {
      return NextResponse.json({ error: "campaign_id is required" }, { status: 400 });
    }

    // Verify user can access this campaign
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id")
      .eq("id", campaignId)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Get pipeline totals from view
    const { data, error } = await supabase
      .from("inbox_pipeline_revenue_totals")
      .select("*")
      .eq("campaign_id", campaignId);

    if (error) {
      console.error("Error fetching pipeline totals:", error);
      return NextResponse.json(
        { error: "Failed to fetch pipeline totals" },
        { status: 500 }
      );
    }

    // Format response
    const totals = (data || []).map((row) => ({
      pipeline_stage: row.pipeline_stage,
      thread_count: Number(row.thread_count || 0),
      total_revenue: Number(row.total_revenue || 0),
      avg_revenue: Number(row.avg_revenue || 0),
      avg_probability: Number(row.avg_probability || 0),
    }));

    // Calculate total pipeline
    const totalPipeline = totals.reduce((sum, t) => sum + t.total_revenue, 0);

    return NextResponse.json({
      totals,
      total_pipeline: totalPipeline,
    });
  } catch (error) {
    console.error("Error in /api/inbox/revenue/pipeline:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



















































