import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaignId = params.id;

    // Verify campaign access
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, workspace_id")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Verify workspace access
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", campaign.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Calculate campaign results
    const { error: calcError } = await supabase.rpc(
      "calculate_campaign_results",
      { p_campaign_id: campaignId }
    );

    if (calcError) {
      console.error("Error calculating campaign results:", calcError);
      return NextResponse.json(
        { error: "Failed to calculate results", details: calcError.message },
        { status: 500 }
      );
    }

    // Fetch the calculated results
    const { data: results, error: resultsError } = await supabase
      .from("campaign_results")
      .select("*")
      .eq("campaign_id", campaignId)
      .single();

    if (resultsError || !results) {
      return NextResponse.json(
        { error: "Failed to fetch results" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("Error in campaign results calc:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaignId = params.id;

    // Verify campaign access
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("id, workspace_id")
      .eq("id", campaignId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Verify workspace access
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", campaign.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Fetch cached results or calculate if missing
    let { data: results, error: resultsError } = await supabase
      .from("campaign_results")
      .select("*")
      .eq("campaign_id", campaignId)
      .single();

    // If no cached results, calculate them
    if (resultsError || !results) {
      const { error: calcError } = await supabase.rpc(
        "calculate_campaign_results",
        { p_campaign_id: campaignId }
      );

      if (calcError) {
        console.error("Error calculating campaign results:", calcError);
        return NextResponse.json(
          { error: "Failed to calculate results" },
          { status: 500 }
        );
      }

      // Fetch the newly calculated results
      const { data: newResults } = await supabase
        .from("campaign_results")
        .select("*")
        .eq("campaign_id", campaignId)
        .single();

      results = newResults;
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Error fetching campaign results:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}





















































