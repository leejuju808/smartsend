import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/analytics/team
 * 
 * Returns team performance analytics including:
 * - Sales team performance
 * - Insurance team efficiency
 * - Ops team metrics
 * - Crew performance
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");
    const teamType = searchParams.get("teamType"); // sales, insurance, ops, crews

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    const results: any = {};

    // Sales Team Performance
    if (!teamType || teamType === "sales") {
      const { data: salesTeam, error: salesError } = await supabase
        .from("v_sales_team_performance")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("total_revenue", { ascending: false });

      results.salesTeam = salesTeam || [];
    }

    // Crew Performance
    if (!teamType || teamType === "crews") {
      const { data: crews, error: crewsError } = await supabase
        .from("v_crew_performance")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("avg_install_hours");

      results.crews = crews || [];
    }

    // Insurance Team (placeholder - can be enhanced with insurance-specific tables)
    if (!teamType || teamType === "insurance") {
      // Get insurance-related metrics from jobs
      const { data: insuranceJobs, error: insuranceError } = await supabase
        .from("roofing_jobs")
        .select("carrier, current_stage, projected_job_value, stage_changed_at")
        .eq("workspace_id", workspaceId)
        // Block 272600: Only SmartSend-origin jobs count
        .eq("origin_source", "smartsend")
        .not("carrier", "is", null);

      const totalInsuranceJobs = insuranceJobs?.length || 0;
      const approvedJobs =
        insuranceJobs?.filter((j) => j.current_stage === "CLAIM_APPROVED")
          .length || 0;
      const insuranceRows = insuranceJobs ?? [];
      const avgApprovalTime =
        insuranceRows.reduce((sum: number, j: any) => {
          if (j.stage_changed_at) {
            const days =
              (new Date().getTime() -
                new Date(j.stage_changed_at).getTime()) /
              (1000 * 60 * 60 * 24);
            return sum + days;
          }
          return sum;
        }, 0) / (totalInsuranceJobs || 1) || 0;

      results.insuranceTeam = {
        totalJobs: totalInsuranceJobs,
        approvedJobs,
        approvalRate:
          totalInsuranceJobs > 0
            ? (approvedJobs / totalInsuranceJobs) * 100
            : 0,
        avgApprovalTimeDays: Math.round(avgApprovalTime * 10) / 10,
      };
    }

    // Ops Team (placeholder - can be enhanced with ops-specific tables)
    if (!teamType || teamType === "ops") {
      // Get ops-related metrics from jobs
      const { data: opsJobs, error: opsError } = await supabase
        .from("roofing_jobs")
        .select("current_stage, install_started_at, install_completed_at")
        .eq("workspace_id", workspaceId)
        // Block 272600: Only SmartSend-origin jobs count
        .eq("origin_source", "smartsend")
        .in("current_stage", ["SCHEDULED_INSTALL", "IN_PROGRESS", "COMPLETED"]);

      const scheduledJobs =
        opsJobs?.filter((j) => j.current_stage === "SCHEDULED_INSTALL")
          .length || 0;
      const inProgressJobs =
        opsJobs?.filter((j) => j.current_stage === "IN_PROGRESS").length || 0;
      const completedJobs =
        opsJobs?.filter((j) => j.current_stage === "COMPLETED").length || 0;

      results.opsTeam = {
        scheduledJobs,
        inProgressJobs,
        completedJobs,
        schedulingEfficiency: scheduledJobs > 0 ? (completedJobs / scheduledJobs) * 100 : 0,
      };
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("Error fetching team analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch team analytics" },
      { status: 500 }
    );
  }
}




































