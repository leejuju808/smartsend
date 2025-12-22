// Block 24700 — SmartSend Roofing Supplier & Crew Scorecard v1
// API Route: GET /api/scorecards/suppliers/[supplierId]
// Returns detailed scorecard for a specific supplier

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ supplierId: string }> }
) {
  try {
    const supabase = createClient();
    const { supplierId } = await params;

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

    // Get scorecard
    const { data: scorecard, error } = await supabase
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
      .eq("supplier_id", supplierId)
      .eq("workspace_id", workspaceMember.workspace_id)
      .single();

    if (error || !scorecard) {
      // If no scorecard exists, calculate it
      const { error: calcError } = await supabase.rpc("calculate_supplier_scorecard", {
        p_supplier_id: supplierId,
      });

      if (calcError) {
        console.error("Error calculating supplier scorecard:", calcError);
        return NextResponse.json(
          { error: "Supplier scorecard not found and could not be calculated" },
          { status: 404 }
        );
      }

      // Retry fetching
      const { data: newScorecard, error: retryError } = await supabase
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
        .eq("supplier_id", supplierId)
        .eq("workspace_id", workspaceMember.workspace_id)
        .single();

      if (retryError || !newScorecard) {
        return NextResponse.json(
          { error: "Supplier scorecard not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        scorecard: formatSupplierScorecard(newScorecard),
      });
    }

    return NextResponse.json({
      scorecard: formatSupplierScorecard(scorecard),
    });
  } catch (error: any) {
    console.error("Error in GET /api/scorecards/suppliers/[supplierId]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

function formatSupplierScorecard(sc: any) {
  return {
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
  };
}






































