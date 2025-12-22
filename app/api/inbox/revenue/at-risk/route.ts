import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/inbox/revenue/at-risk
 * Fetch revenue at risk and list of threads in danger
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

    // Call the revenue at risk function
    const { data, error } = await supabase
      .rpc("get_revenue_at_risk", { p_campaign_id: campaignId })
      .single();

    if (error) {
      console.error("Error fetching revenue at risk:", error);
      return NextResponse.json(
        { error: "Failed to fetch revenue at risk" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      total_at_risk: Number(data?.total_at_risk || 0),
      thread_count: Number(data?.thread_count || 0),
      threads: data?.threads || [],
    });
  } catch (error) {
    console.error("Error in /api/inbox/revenue/at-risk:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



















































