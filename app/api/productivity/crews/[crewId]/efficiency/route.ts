// Block 254000 — SmartSend Productivity Engine v1
// API Route: Get Crew Efficiency Score
// GET /api/productivity/crews/[crewId]/efficiency?workspace_id=xxx&period=30

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ crewId: string }> }
) {
  try {
    const { crewId } = await params;
    const supabase = createClient();

    // Authenticate
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspace_id = searchParams.get("workspace_id");
    const periodDays = parseInt(searchParams.get("period") || "30");

    if (!workspace_id) {
      return NextResponse.json(
        { error: "workspace_id required" },
        { status: 400 }
      );
    }

    // Verify workspace access
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Verify crew belongs to workspace
    const { data: crew, error: crewError } = await supabase
      .from("crews")
      .select("id, name, workspace_id")
      .eq("id", crewId)
      .eq("workspace_id", workspace_id)
      .single();

    if (crewError || !crew) {
      return NextResponse.json({ error: "Crew not found" }, { status: 404 });
    }

    const periodEnd = new Date();
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - periodDays);

    // Calculate efficiency score
    const { data: efficiencyData, error: efficiencyError } = await supabase.rpc(
      "calculate_crew_efficiency_score",
      {
        p_crew_id: crewId,
        p_period_start: periodStart.toISOString().split("T")[0],
        p_period_end: periodEnd.toISOString().split("T")[0],
      }
    );

    if (efficiencyError) {
      console.error("Error calculating efficiency:", efficiencyError);
      return NextResponse.json(
        { error: "Failed to calculate efficiency score" },
        { status: 500 }
      );
    }

    const efficiency = efficiencyData?.[0] || null;

    // Get install speed metrics
    const { data: speedMetrics, error: speedError } = await supabase
      .from("job_task_durations")
      .select("task_name, duration_minutes, variance_percent")
      .eq("crew_id", crewId)
      .gte("start_time", periodStart.toISOString())
      .lte("start_time", periodEnd.toISOString())
      .not("duration_minutes", "is", null);

    // Get material waste data
    const { data: wasteData, error: wasteError } = await supabase
      .from("material_waste_logs")
      .select("material_name, waste_percent, waste_category")
      .in(
        "job_id",
        (
          await supabase
            .from("job_task_durations")
            .select("job_id")
            .eq("crew_id", crewId)
            .gte("start_time", periodStart.toISOString())
            .lte("start_time", periodEnd.toISOString())
        ).data?.map((d) => d.job_id) || []
      )
      .gte("created_at", periodStart.toISOString())
      .lte("created_at", periodEnd.toISOString());

    return NextResponse.json({
      success: true,
      crew: {
        id: crew.id,
        name: crew.name,
      },
      efficiency: efficiency
        ? {
            score: efficiency.score,
            rating_tier: efficiency.rating_tier,
            component_scores: {
              install_speed: efficiency.install_speed_score,
              qc_quality: efficiency.qc_quality_score,
              material_waste: efficiency.material_waste_score,
              on_time_rate: efficiency.on_time_rate_score,
              safety: efficiency.safety_score,
            },
            jobs_count: efficiency.jobs_count,
          }
        : null,
      speed_metrics: speedMetrics || [],
      material_waste: wasteData || [],
      period: {
        days: periodDays,
        start: periodStart.toISOString().split("T")[0],
        end: periodEnd.toISOString().split("T")[0],
      },
    });
  } catch (error: any) {
    console.error("Error in crew efficiency route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}























