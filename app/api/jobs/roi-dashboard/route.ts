// Block 37444 — SmartSend Roofing Job Costing + Profit Calculator Engine v1
// API Route: ROI Dashboard metrics
// GET /api/jobs/roi-dashboard

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";
import { getCurrentTeamId } from "@/lib/team-helpers";

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const teamId = await getCurrentTeamId();

    if (!teamId) {
      return NextResponse.json(
        { error: "Team ID not found" },
        { status: 401 }
      );
    }

    const { searchParams } = req.nextUrl;
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    // Build date filter
    let dateFilter = "";
    if (startDate && endDate) {
      dateFilter = `AND j.created_at >= '${startDate}' AND j.created_at <= '${endDate}'`;
    }

    // Get all jobs with costs for the team
    const { data: jobsWithCosts, error: jobsError } = await supabase
      .from("job_costs")
      .select(
        `
        *,
        jobs!inner (
          id,
          contract_value,
          stage,
          created_at,
          leads (
            id,
            first_name,
            last_name
          )
        )
      `
      )
      .eq("team_id", teamId);

    if (jobsError) {
      console.error("Error fetching jobs with costs:", jobsError);
      return NextResponse.json(
        { error: "Failed to fetch ROI data" },
        { status: 500 }
      );
    }

    // Calculate metrics
    const totalJobs = jobsWithCosts?.length || 0;
    const completedJobs =
      jobsWithCosts?.filter(
        (j: any) => j.jobs?.stage === "completed"
      ).length || 0;

    const totalRevenue =
      jobsWithCosts?.reduce(
        (sum: number, j: any) =>
          sum + (j.actual_revenue || j.projected_revenue || 0),
        0
      ) || 0;

    const totalCost =
      jobsWithCosts?.reduce((sum: number, j: any) => sum + (j.total_cost || 0), 0) ||
      0;

    const totalProfit = totalRevenue - totalCost;
    const avgMargin =
      jobsWithCosts?.length > 0
        ? jobsWithCosts.reduce(
            (sum: number, j: any) => sum + (j.margin || 0),
            0
          ) / jobsWithCosts.length
        : 0;

    // Get cost breakdown
    const totalMaterials =
      jobsWithCosts?.reduce(
        (sum: number, j: any) => sum + (j.materials_cost || 0),
        0
      ) || 0;
    const totalLabor =
      jobsWithCosts?.reduce((sum: number, j: any) => sum + (j.labor_cost || 0), 0) ||
      0;
    const totalEquipment =
      jobsWithCosts?.reduce(
        (sum: number, j: any) => sum + (j.equipment_cost || 0),
        0
      ) || 0;
    const totalDumpster =
      jobsWithCosts?.reduce(
        (sum: number, j: any) => sum + (j.dumpster_cost || 0),
        0
      ) || 0;

    // Get jobs with lowest margins
    const lowMarginJobs = jobsWithCosts
      ?.filter((j: any) => j.margin !== null && j.margin < 30)
      .sort((a: any, b: any) => a.margin - b.margin)
      .slice(0, 10)
      .map((j: any) => ({
        job_id: j.job_id,
        margin: j.margin,
        profit: j.profit,
        revenue: j.actual_revenue || j.projected_revenue,
        customer_name: j.jobs?.leads
          ? `${j.jobs.leads.first_name || ""} ${j.jobs.leads.last_name || ""}`.trim()
          : "Unknown",
      })) || [];

    // Get jobs with highest margins
    const highMarginJobs = jobsWithCosts
      ?.filter((j: any) => j.margin !== null && j.margin > 0)
      .sort((a: any, b: any) => b.margin - a.margin)
      .slice(0, 10)
      .map((j: any) => ({
        job_id: j.job_id,
        margin: j.margin,
        profit: j.profit,
        revenue: j.actual_revenue || j.projected_revenue,
        customer_name: j.jobs?.leads
          ? `${j.jobs.leads.first_name || ""} ${j.jobs.leads.last_name || ""}`.trim()
          : "Unknown",
      })) || [];

    // Get crew efficiency (if crew_hours data available)
    const { data: crewHoursData, error: crewHoursError } = await supabase
      .from("crew_hours")
      .select("crew_name, total_cost, total_hours, job_id")
      .eq("team_id", teamId);

    const crewEfficiency: Record<string, any> = {};
    if (crewHoursData) {
      crewHoursData.forEach((hour: any) => {
        if (!crewEfficiency[hour.crew_name || "Unknown"]) {
          crewEfficiency[hour.crew_name || "Unknown"] = {
            total_hours: 0,
            total_cost: 0,
            jobs_count: 0,
          };
        }
        crewEfficiency[hour.crew_name || "Unknown"].total_hours +=
          hour.total_hours || 0;
        crewEfficiency[hour.crew_name || "Unknown"].total_cost +=
          hour.total_cost || 0;
        crewEfficiency[hour.crew_name || "Unknown"].jobs_count += 1;
      });
    }

    // Calculate per-square metrics (if square_footage available)
    const jobsWithSquares = jobsWithCosts?.filter(
      (j: any) => j.square_footage && j.square_footage > 0
    ) || [];

    const totalSquares =
      jobsWithSquares.reduce(
        (sum: number, j: any) => sum + (j.square_footage || 0),
        0
      ) || 0;

    const avgCostPerSquare =
      totalSquares > 0 ? totalCost / totalSquares : 0;
    const avgProfitPerSquare =
      totalSquares > 0 ? totalProfit / totalSquares : 0;

    return NextResponse.json({
      summary: {
        total_jobs: totalJobs,
        completed_jobs: completedJobs,
        total_revenue: totalRevenue,
        total_cost: totalCost,
        total_profit: totalProfit,
        avg_margin: avgMargin,
      },
      cost_breakdown: {
        materials: totalMaterials,
        labor: totalLabor,
        equipment: totalEquipment,
        dumpster: totalDumpster,
      },
      low_margin_jobs: lowMarginJobs,
      high_margin_jobs: highMarginJobs,
      crew_efficiency: Object.entries(crewEfficiency).map(([name, data]) => ({
        crew_name: name,
        ...data,
        avg_cost_per_hour:
          data.total_hours > 0 ? data.total_cost / data.total_hours : 0,
      })),
      per_square_metrics: {
        total_squares: totalSquares,
        avg_cost_per_square: avgCostPerSquare,
        avg_profit_per_square: avgProfitPerSquare,
      },
    });
  } catch (error: any) {
    console.error("Error in ROI dashboard route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































