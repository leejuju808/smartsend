// Block 43000 — SmartSend Roofing "Job Costs + Labor & Material Budget Engine" v1
// API Route: Calculate job costs (estimated vs actual)
// POST /api/jobs/[jobId]/costs/calculate

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get job to verify access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Call the calculate_job_costs function
    const { data: result, error: calcError } = await supabase.rpc(
      "calculate_job_costs",
      { p_job_id: jobId }
    );

    if (calcError) {
      console.error("Error calculating job costs:", calcError);
      return NextResponse.json(
        { error: "Failed to calculate job costs", details: calcError.message },
        { status: 500 }
      );
    }

    // Get updated actual costs
    const { data: actualCosts, error: costsError } = await supabase
      .from("job_actual_costs")
      .select("*")
      .eq("job_id", jobId)
      .single();

    // Get estimate
    const { data: estimate, error: estimateError } = await supabase
      .from("job_estimates")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get overruns
    const { data: overruns, error: overrunsError } = await supabase
      .from("job_cost_overruns")
      .select("*")
      .eq("job_id", jobId)
      .eq("acknowledged", false)
      .order("created_at", { ascending: false });

    return NextResponse.json({
      success: true,
      calculation: result,
      actualCosts: actualCosts || null,
      estimate: estimate || null,
      overruns: overruns || [],
    });
  } catch (error: any) {
    console.error("Error in calculate job costs route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET current job costs data
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get job to verify access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id, job_value")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get estimate
    const { data: estimate, error: estimateError } = await supabase
      .from("job_estimates")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get actual costs
    const { data: actualCosts, error: costsError } = await supabase
      .from("job_actual_costs")
      .select("*")
      .eq("job_id", jobId)
      .maybeSingle();

    // Get material usage
    const { data: materialUsage, error: materialError } = await supabase
      .from("material_usage")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    // Get labor hours
    const { data: laborHours, error: laborError } = await supabase
      .from("crew_check_ins")
      .select("billable_hours, check_in_time, check_out_time")
      .eq("job_id", jobId)
      .not("check_out_time", "is", null);

    // If no crew_check_ins, try crew_hours
    let totalLaborHours = 0;
    if (!laborHours || laborHours.length === 0) {
      const { data: crewHours } = await supabase
        .from("crew_hours")
        .select("total_hours")
        .eq("job_id", jobId)
        .not("end_time", "is", null);

      if (crewHours) {
        totalLaborHours = crewHours.reduce(
          (sum, h) => sum + (h.total_hours || 0),
          0
        );
      }
    } else {
      totalLaborHours = laborHours.reduce(
        (sum, h) => sum + (h.billable_hours || 0),
        0
      );
    }

    // Get change orders
    const { data: changeOrders, error: coError } = await supabase
      .from("roofing_change_orders")
      .select(
        `
        id,
        status,
        reason_category,
        created_at,
        approved_at,
        roofing_change_order_revenue(amount, approved)
      `
      )
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    // Get overruns
    const { data: overruns, error: overrunsError } = await supabase
      .from("job_cost_overruns")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    return NextResponse.json({
      estimate: estimate || null,
      actualCosts: actualCosts || null,
      materialUsage: materialUsage || [],
      laborHours: totalLaborHours,
      changeOrders: changeOrders || [],
      overruns: overruns || [],
      jobValue: job.job_value,
    });
  } catch (error: any) {
    console.error("Error in get job costs route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































