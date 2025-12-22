import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/repair/metrics
 * Get repair metrics and insights for a workspace
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Get repair jobs created
    const { data: allRepairs, error: repairsError } = await supabase
      .from("repair_intelligence")
      .select("id, status, repair_score, repair_type, detected_at, replacement_recommended")
      .eq("workspace_id", workspaceId);

    if (repairsError) {
      console.error("Error fetching repairs:", repairsError);
      return NextResponse.json(
        { error: "Failed to fetch repair data" },
        { status: 500 }
      );
    }

    const totalRepairs = allRepairs?.length || 0;
    const completedRepairs =
      allRepairs?.filter((r) => r.status === "completed").length || 0;
    const scheduledRepairs =
      allRepairs?.filter((r) => r.status === "scheduled").length || 0;
    const inProgressRepairs =
      allRepairs?.filter((r) => r.status === "in_progress").length || 0;

    // Calculate average repair value (if we have cost estimates)
    const repairsWithCosts = allRepairs?.filter(
      (r) => r.repair_score && r.repair_score > 0
    ) || [];
    const averageRepairScore =
      repairsWithCosts.length > 0
        ? Math.round(
            repairsWithCosts.reduce(
              (sum, r) => sum + (r.repair_score || 0),
              0
            ) / repairsWithCosts.length
          )
        : 0;

    // Repair → Replacement conversion
    const replacementRecommended =
      allRepairs?.filter((r) => r.replacement_recommended === true).length ||
      0;
    const replacementConversionRate =
      totalRepairs > 0
        ? Math.round((replacementRecommended / totalRepairs) * 100)
        : 0;

    // Repair backlog (detected but not completed)
    const repairBacklog =
      allRepairs?.filter(
        (r) =>
          r.status === "detected" ||
          r.status === "scheduled" ||
          r.status === "in_progress"
      ).length || 0;

    // Emergency leaks handled
    const emergencyRepairs =
      allRepairs?.filter((r) => r.repair_score && r.repair_score >= 90)
        .length || 0;

    // Upsell success rate (replacement recommended)
    const upsellSuccessRate =
      totalRepairs > 0
        ? Math.round((replacementRecommended / totalRepairs) * 100)
        : 0;

    // Repair types breakdown
    const repairTypesBreakdown =
      allRepairs?.reduce((acc: Record<string, number>, r) => {
        acc[r.repair_type] = (acc[r.repair_type] || 0) + 1;
        return acc;
      }, {}) || {};

    // Urgency breakdown
    const urgencyBreakdown = {
      emergency:
        allRepairs?.filter((r) => r.repair_score && r.repair_score >= 90)
          .length || 0,
      immediate:
        allRepairs?.filter(
          (r) => r.repair_score && r.repair_score >= 75 && r.repair_score < 90
        ).length || 0,
      routine:
        allRepairs?.filter(
          (r) => r.repair_score && r.repair_score >= 55 && r.repair_score < 75
        ).length || 0,
      low:
        allRepairs?.filter(
          (r) => r.repair_score && r.repair_score >= 40 && r.repair_score < 55
        ).length || 0,
      uncertain:
        allRepairs?.filter((r) => !r.repair_score || r.repair_score < 40)
          .length || 0,
    };

    // Recent repairs (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentRepairs =
      allRepairs?.filter(
        (r) => new Date(r.detected_at) >= thirtyDaysAgo
      ).length || 0;

    return NextResponse.json({
      metrics: {
        repair_jobs_created: totalRepairs,
        repair_jobs_completed: completedRepairs,
        repair_jobs_scheduled: scheduledRepairs,
        repair_jobs_in_progress: inProgressRepairs,
        average_repair_score: averageRepairScore,
        repair_replacement_conversion: replacementConversionRate,
        repair_backlog: repairBacklog,
        emergency_leaks_handled: emergencyRepairs,
        upsell_success_rate: upsellSuccessRate,
        recent_repairs_30_days: recentRepairs,
      },
      breakdowns: {
        repair_types: repairTypesBreakdown,
        urgency: urgencyBreakdown,
      },
      summary: {
        completion_rate:
          totalRepairs > 0
            ? Math.round((completedRepairs / totalRepairs) * 100)
            : 0,
        average_time_to_complete: null, // Would need completion timestamps
        top_repair_type: Object.keys(repairTypesBreakdown).reduce(
          (a, b) =>
            (repairTypesBreakdown[a] || 0) > (repairTypesBreakdown[b] || 0)
              ? a
              : b,
          ""
        ),
      },
    });
  } catch (error) {
    console.error("Error in GET /api/repair/metrics:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}





















































