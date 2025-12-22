// Block 37444 — SmartSend Roofing Job Costing + Profit Calculator Engine v1
// API Route: Calculate job profit
// POST /api/jobs/[jobId]/profit/calculate

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";
import { getCurrentTeamId } from "@/lib/team-helpers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = await getServerSupabase();
    const teamId = await getCurrentTeamId();

    if (!teamId) {
      return NextResponse.json(
        { error: "Team ID not found" },
        { status: 401 }
      );
    }

    // Verify job exists and belongs to team
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, team_id, contract_value")
      .eq("id", jobId)
      .eq("team_id", teamId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Call the calculate_job_profit function
    const { data: result, error: calcError } = await supabase.rpc(
      "calculate_job_profit",
      { p_job_id: jobId }
    );

    if (calcError) {
      console.error("Error calculating profit:", calcError);
      return NextResponse.json(
        { error: "Failed to calculate profit", details: calcError.message },
        { status: 500 }
      );
    }

    // Get the updated job_costs record
    const { data: costs, error: costsError } = await supabase
      .from("job_costs")
      .select("*")
      .eq("job_id", jobId)
      .single();

    if (costsError && costsError.code !== "PGRST116") {
      console.error("Error fetching costs:", costsError);
    }

    return NextResponse.json({
      success: true,
      calculation: result,
      costs: costs || null,
    });
  } catch (error: any) {
    console.error("Error in calculate profit route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET current profit data
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = await getServerSupabase();
    const teamId = await getCurrentTeamId();

    if (!teamId) {
      return NextResponse.json(
        { error: "Team ID not found" },
        { status: 401 }
      );
    }

    // Get job costs
    const { data: costs, error: costsError } = await supabase
      .from("job_costs")
      .select("*")
      .eq("job_id", jobId)
      .single();

    if (costsError && costsError.code !== "PGRST116") {
      return NextResponse.json(
        { error: "Failed to fetch costs" },
        { status: 500 }
      );
    }

    // Get cost items breakdown
    const { data: costItems, error: itemsError } = await supabase
      .from("job_cost_items")
      .select("*")
      .eq("job_id", jobId)
      .order("cost_date", { ascending: false });

    if (itemsError) {
      console.error("Error fetching cost items:", itemsError);
    }

    // Get crew hours
    const { data: crewHours, error: hoursError } = await supabase
      .from("crew_hours")
      .select("*")
      .eq("job_id", jobId)
      .order("start_time", { ascending: false });

    if (hoursError) {
      console.error("Error fetching crew hours:", hoursError);
    }

    // Get active warnings
    const { data: warnings, error: warningsError } = await supabase
      .from("profit_warnings")
      .select("*")
      .eq("job_id", jobId)
      .eq("acknowledged", false)
      .order("created_at", { ascending: false });

    if (warningsError) {
      console.error("Error fetching warnings:", warningsError);
    }

    return NextResponse.json({
      costs: costs || null,
      costItems: costItems || [],
      crewHours: crewHours || [],
      warnings: warnings || [],
    });
  } catch (error: any) {
    console.error("Error in get profit route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































