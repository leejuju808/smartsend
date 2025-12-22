// Block 24700 — SmartSend Roofing Supplier & Crew Scorecard v1
// API Route: GET /api/scorecards/suppliers
// Returns supplier scorecards for the authenticated user's workspace

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get user's workspace
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!workspaceMember) {
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 404 }
      );
    }

    const workspaceId = workspaceMember.workspace_id;

    // Get query parameters
    const { searchParams } = new URL(req.url);
    const sortBy = searchParams.get("sort") || "overall_score";
    const order = searchParams.get("order") || "desc";
    const limit = parseInt(searchParams.get("limit") || "50");
    const minScore = searchParams.get("min_score") ? parseFloat(searchParams.get("min_score")!) : null;

    // Build query
    let query = supabase
      .from("supplier_scorecards")
      .select(`
        *,
        suppliers (
          id,
          name,
          contact_name,
          phone,
          email,
          is_active
        )
      `)
      .eq("workspace_id", workspaceId)
      .order(sortBy, { ascending: order === "asc" })
      .limit(limit);

    if (minScore !== null) {
      query = query.gte("overall_score", minScore);
    }

    const { data: scorecards, error } = await query;

    if (error) {
      console.error("Error fetching supplier scorecards:", error);
      return NextResponse.json(
        { error: error.message || "Failed to fetch supplier scorecards" },
        { status: 500 }
      );
    }

    // Format response
    const formattedScorecards = scorecards?.map((sc) => ({
      id: sc.id,
      supplier_id: sc.supplier_id,
      supplier: sc.suppliers,
      overall_score: parseFloat(sc.overall_score),
      category_scores: {
        delivery_accuracy: parseFloat(sc.delivery_accuracy_score),
        on_time_delivery: parseFloat(sc.on_time_delivery_score),
        issue_resolution_speed: parseFloat(sc.issue_resolution_speed_score),
        pricing_consistency: parseFloat(sc.pricing_consistency_score),
        communication_quality: parseFloat(sc.communication_quality_score),
      },
      metrics: {
        total_orders: sc.total_orders,
        accurate_deliveries_count: sc.accurate_deliveries_count,
        inaccurate_deliveries_count: sc.inaccurate_deliveries_count,
        on_time_deliveries_count: sc.on_time_deliveries_count,
        late_deliveries_count: sc.late_deliveries_count,
        total_issues: sc.total_issues,
        avg_issue_resolution_hours: parseFloat(sc.avg_issue_resolution_hours || "0"),
        pricing_variance_count: sc.pricing_variance_count,
        communication_responses_count: sc.communication_responses_count,
        avg_response_time_hours: parseFloat(sc.avg_response_time_hours || "0"),
      },
      score_details: sc.score_details,
      calculated_at: sc.calculated_at,
      updated_at: sc.updated_at,
    }));

    return NextResponse.json({
      scorecards: formattedScorecards || [],
      count: formattedScorecards?.length || 0,
    });
  } catch (error: any) {
    console.error("Error in GET /api/scorecards/suppliers:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































