// Block 22263 — SmartSend Roofing Proposal Insights Dashboard v1
// API Route: Get Proposal Insights Dashboard Data
// Returns aggregated proposal performance metrics for the dashboard

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Get workspace ID from active workspace
    const workspaceId = await getActiveWorkspaceId();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID required" },
        { status: 400 }
      );
    }

    // Fetch summary data
    const { data: summary, error: summaryError } = await supabase
      .from("proposal_insights_summary")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (summaryError) {
      console.error("Error fetching proposal insights summary:", summaryError);
      return NextResponse.json(
        { error: "Failed to fetch summary", details: summaryError.message },
        { status: 500 }
      );
    }

    // Fetch amount buckets data
    const { data: amountBuckets, error: bucketsError } = await supabase
      .from("proposal_amount_buckets")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("price_bucket", { ascending: true });

    if (bucketsError) {
      console.error("Error fetching proposal amount buckets:", bucketsError);
      return NextResponse.json(
        { error: "Failed to fetch amount buckets", details: bucketsError.message },
        { status: 500 }
      );
    }

    // Fetch intent performance data
    const { data: intentPerformance, error: intentError } = await supabase
      .from("proposal_intent_performance")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("intent", { ascending: true });

    if (intentError) {
      console.error("Error fetching proposal intent performance:", intentError);
      return NextResponse.json(
        { error: "Failed to fetch intent performance", details: intentError.message },
        { status: 500 }
      );
    }

    // Return default values if no data exists yet
    const defaultSummary = {
      workspace_id: workspaceId,
      total_proposals: 0,
      total_approved: 0,
      total_declined: 0,
      total_pending: 0,
      total_viewed: 0,
      total_considering: 0,
      win_rate: 0,
      revenue_won: 0,
      revenue_open: 0,
      hot_count: 0,
      warm_count: 0,
      cold_count: 0,
      decline_count: 0,
      avg_view_time_days: null,
      avg_close_time_days: null,
    };

    return NextResponse.json({
      summary: summary || defaultSummary,
      pricing: amountBuckets || [],
      intent: intentPerformance || [],
    });
  } catch (error) {
    console.error("Error in proposal dashboard API:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}








































