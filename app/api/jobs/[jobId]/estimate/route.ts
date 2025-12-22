// Block 43000 — SmartSend Roofing "Job Costs + Labor & Material Budget Engine" v1
// API Route: Create/Update job estimate
// POST /api/jobs/[jobId]/estimate

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

    const body = await req.json();
    const {
      estimated_materials,
      estimated_labor_hours,
      estimated_labor_rate,
      estimated_crew_size,
      dumpster_cost,
      delivery_cost,
      other_costs,
      markup_percentage,
    } = body;

    // Check if estimate already exists
    const { data: existingEstimate } = await supabase
      .from("job_estimates")
      .select("id")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const estimateData: any = {
      job_id: jobId,
      workspace_id: job.workspace_id,
      estimated_materials: estimated_materials || {},
      estimated_labor_hours: estimated_labor_hours || 0,
      estimated_labor_rate: estimated_labor_rate || 0,
      estimated_crew_size: estimated_crew_size || 1,
      dumpster_cost: dumpster_cost || 0,
      delivery_cost: delivery_cost || 0,
      other_costs: other_costs || 0,
      markup_percentage: markup_percentage || 0,
      created_by: user.id,
    };

    let result;
    if (existingEstimate) {
      // Update existing estimate
      const { data, error } = await supabase
        .from("job_estimates")
        .update(estimateData)
        .eq("id", existingEstimate.id)
        .select()
        .single();

      if (error) {
        console.error("Error updating estimate:", error);
        return NextResponse.json(
          { error: "Failed to update estimate", details: error.message },
          { status: 500 }
        );
      }
      result = data;
    } else {
      // Create new estimate
      const { data, error } = await supabase
        .from("job_estimates")
        .insert(estimateData)
        .select()
        .single();

      if (error) {
        console.error("Error creating estimate:", error);
        return NextResponse.json(
          { error: "Failed to create estimate", details: error.message },
          { status: 500 }
        );
      }
      result = data;
    }

    // Trigger cost calculation
    await supabase.rpc("calculate_job_costs", { p_job_id: jobId });

    return NextResponse.json({ success: true, estimate: result });
  } catch (error: any) {
    console.error("Error in create/update estimate route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET job estimate
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

    // Get estimate
    const { data: estimate, error: estimateError } = await supabase
      .from("job_estimates")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ estimate: estimate || null });
  } catch (error: any) {
    console.error("Error in get estimate route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































