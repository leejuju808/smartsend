import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/inbox/revenue/by-source
 * Fetch lead value aggregated by source
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

    // Get lead value by source from view
    const { data, error } = await supabase
      .from("inbox_lead_value_by_source")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("total_value", { ascending: false });

    if (error) {
      console.error("Error fetching lead value by source:", error);
      return NextResponse.json(
        { error: "Failed to fetch lead value by source" },
        { status: 500 }
      );
    }

    // Format response
    const sources = (data || []).map((row) => ({
      lead_source: row.lead_source,
      lead_count: Number(row.lead_count || 0),
      total_value: Number(row.total_value || 0),
      avg_value: Number(row.avg_value || 0),
      avg_probability: Number(row.avg_probability || 0),
    }));

    return NextResponse.json({ sources });
  } catch (error) {
    console.error("Error in /api/inbox/revenue/by-source:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



















































