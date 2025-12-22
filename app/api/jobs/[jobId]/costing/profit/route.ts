// Block 255700 — SmartSend Job Costing & Profit Engine v1
// API Route: Get/Update job profit dashboard
// GET /api/jobs/[jobId]/costing/profit - Get real-time profit dashboard
// POST /api/jobs/[jobId]/costing/profit - Recalculate profit

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET real-time job profit dashboard
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get job to verify access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id, job_value, title, status")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Get job costs
    const { data: costs, error: costsError } = await supabase
      .from("job_costs")
      .select("*")
      .eq("job_id", jobId)
      .single();

    // Get material usage with variance
    const { data: materials, error: materialsError } = await supabase
      .from("material_usage")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    // Get labor entries
    const { data: laborEntries, error: laborError } = await supabase
      .from("labor_entries")
      .select(`
        *,
        crew_members (
          id,
          name,
          role
        )
      `)
      .eq("job_id", jobId)
      .order("clock_in", { ascending: false });

    // Get variance alerts
    const { data: varianceAlerts, error: alertsError } = await supabase
      .from("job_variance_alerts")
      .select("*")
      .eq("job_id", jobId)
      .eq("acknowledged", false)
      .order("created_at", { ascending: false });

    // Calculate material variance summary
    const materialVariance = materials?.reduce(
      (acc, m) => {
        if (m.quantity_expected && m.quantity_actual) {
          const variance = m.quantity_actual - m.quantity_expected;
          const costVariance = variance * (m.cost_per_unit || 0);
          acc.totalExpected += m.quantity_expected;
          acc.totalActual += m.quantity_actual;
          acc.costVariance += costVariance;
        }
        return acc;
      },
      { totalExpected: 0, totalActual: 0, costVariance: 0 }
    ) || { totalExpected: 0, totalActual: 0, costVariance: 0 };

    // Calculate labor summary
    const laborSummary = laborEntries?.reduce(
      (acc, entry) => {
        if (entry.clock_out && entry.hours_worked) {
          acc.totalHours += entry.hours_worked;
          acc.totalCost += entry.cost || 0;
        }
        return acc;
      },
      { totalHours: 0, totalCost: 0 }
    ) || { totalHours: 0, totalCost: 0 };

    return NextResponse.json({
      job: {
        id: job.id,
        title: job.title,
        status: job.status,
        revenue: job.job_value || 0,
      },
      costs: costs || {
        materials_cost: 0,
        labor_cost: 0,
        overhead_allocated: 0,
        total_cost: 0,
        revenue: job.job_value || 0,
        profit: 0,
        margin: 0,
      },
      materials: {
        items: materials || [],
        variance: {
          expected: materialVariance.totalExpected,
          actual: materialVariance.totalActual,
          cost_impact: materialVariance.costVariance,
        },
      },
      labor: {
        entries: laborEntries || [],
        summary: {
          total_hours: laborSummary.totalHours,
          total_cost: laborSummary.totalCost,
        },
      },
      variance_alerts: varianceAlerts || [],
    });
  } catch (error: any) {
    console.error("Error in get profit dashboard:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST recalculate job costs and profit
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify job exists
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Call update_job_costs function
    const { data: result, error: calcError } = await supabase.rpc(
      "update_job_costs",
      { p_job_id: jobId }
    );

    if (calcError) {
      console.error("Error calculating costs:", calcError);
      return NextResponse.json(
        { error: "Failed to calculate costs", details: calcError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      calculation: result,
    });
  } catch (error: any) {
    console.error("Error in recalculate profit:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















