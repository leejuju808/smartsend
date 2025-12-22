// Block 63000 — SmartSend Roofing Risk Detection + Warranty Liability AI System v1
// API Route: Risk Dashboard Data
// GET /api/risk/dashboard

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspaces/server";

/**
 * Returns risk dashboard data: assessments, alerts, and warranty exposure
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    
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

    // Get workspace ID from context or query
    const { searchParams } = new URL(req.url);
    let workspaceId = searchParams.get("workspace_id");
    
    if (!workspaceId) {
      workspaceId = await getActiveWorkspaceId();
    }

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Get recent risk assessments with job info
    const { data: assessments, error: assessmentsError } = await supabase
      .from("risk_assessments")
      .select(`
        *,
        job:roofing_jobs(id, title, crew_name)
      `)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (assessmentsError) {
      console.error("Error fetching assessments:", assessmentsError);
    }

    // Get unresolved alerts
    const { data: alerts, error: alertsError } = await supabase
      .from("risk_alerts")
      .select(`
        *,
        job:roofing_jobs(id, title)
      `)
      .eq("workspace_id", workspaceId)
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(20);

    if (alertsError) {
      console.error("Error fetching alerts:", alertsError);
    }

    // Calculate warranty exposure
    const assessmentsList = assessments || [];
    const highRiskJobs = assessmentsList.filter(a => a.risk_score >= 60);
    const mediumRiskJobs = assessmentsList.filter(a => a.risk_score >= 40 && a.risk_score < 60);
    const lowRiskJobs = assessmentsList.filter(a => a.risk_score < 40);

    // Calculate total predicted liability
    let totalPredictedLiability = 0;
    let predictedClaimsNext6Months = 0;

    for (const assessment of assessmentsList) {
      const warrantyRisk = assessment.warranty_risk || {};
      const costRange = warrantyRisk.estimated_cost_range || {};
      const avgCost = (costRange.min || 0 + costRange.max || 0) / 2;
      
      if (warrantyRisk.probability && warrantyRisk.probability > 0) {
        totalPredictedLiability += avgCost * (warrantyRisk.probability / 100);
      }

      // Count claims predicted in next 6 months
      const timelineMonths = warrantyRisk.predicted_timeline_months || [];
      if (timelineMonths.some((m: number) => m <= 6) && warrantyRisk.probability > 30) {
        predictedClaimsNext6Months += 1;
      }
    }

    const exposure = {
      total_predicted_liability: Math.round(totalPredictedLiability),
      high_risk_jobs_count: highRiskJobs.length,
      medium_risk_jobs_count: mediumRiskJobs.length,
      low_risk_jobs_count: lowRiskJobs.length,
      predicted_claims_next_6_months: predictedClaimsNext6Months,
    };

    return NextResponse.json({
      success: true,
      assessments: assessments || [],
      alerts: alerts || [],
      exposure,
    });
  } catch (error: any) {
    console.error("Error in risk dashboard API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




























