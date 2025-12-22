// Block 25340 — SmartSend Roofing Job Costing & Profit Engine v1
// API Route: Create/Update Labor Costs (TOT/TOI, Crew Size, Per-Square Rates)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get workspace_id from job
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
      id, // Optional: if updating existing entry
      crew_name,
      tot_hours,
      toi_hours,
      extra_hours,
      crew_size,
      labor_type, // 'hourly' or 'per_square'
      hourly_rate,
      per_square_rate,
      squares,
      decking_labor_hours,
      repair_labor_hours,
      overtime_hours,
      overtime_rate_multiplier,
      notes,
    } = body;

    if (!crew_name || (!hourly_rate && labor_type === 'hourly') || (!per_square_rate && labor_type === 'per_square')) {
      return NextResponse.json(
        { error: "Missing required fields: crew_name and rate" },
        { status: 400 }
      );
    }

    const laborData: any = {
      job_id: jobId,
      workspace_id: job.workspace_id,
      crew_name,
      labor_type: labor_type || 'hourly',
      notes: notes || null,
    };

    if (labor_type === 'hourly') {
      laborData.hourly_rate = hourly_rate;
      laborData.tot_hours = tot_hours || 0;
      laborData.toi_hours = toi_hours || 0;
      laborData.extra_hours = extra_hours || 0;
      laborData.crew_size = crew_size || 1;
      laborData.decking_labor_hours = decking_labor_hours || 0;
      laborData.repair_labor_hours = repair_labor_hours || 0;
      laborData.overtime_hours = overtime_hours || 0;
      laborData.overtime_rate_multiplier = overtime_rate_multiplier || 1.5;
    } else if (labor_type === 'per_square') {
      laborData.per_square_rate = per_square_rate;
      laborData.squares = squares;
      if (!squares) {
        return NextResponse.json(
          { error: "squares required for per_square labor type" },
          { status: 400 }
        );
      }
    }

    let result;
    if (id) {
      // Update existing entry
      const { data, error } = await supabase
        .from("job_labor_costs")
        .update(laborData)
        .eq("id", id)
        .eq("workspace_id", job.workspace_id)
        .select()
        .single();

      if (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      result = data;
    } else {
      // Create new entry
      const { data, error } = await supabase
        .from("job_labor_costs")
        .insert(laborData)
        .select()
        .single();

      if (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      result = data;
    }

    // Trigger recalculation (should happen automatically via trigger, but call explicitly)
    await supabase.rpc("recalc_job_financials", { p_job_id: jobId });

    return NextResponse.json({ success: true, labor_cost: result });
  } catch (error: any) {
    console.error("Labor cost error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get workspace_id from job
    const { data: job } = await supabase
      .from("roofing_jobs")
      .select("workspace_id")
      .eq("id", jobId)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Get labor costs
    const { data: laborCosts, error } = await supabase
      .from("job_labor_costs")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ labor_costs: laborCosts || [] });
  } catch (error: any) {
    console.error("Get labor costs error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;
    const { searchParams } = new URL(req.url);
    const laborCostId = searchParams.get("id");

    if (!laborCostId) {
      return NextResponse.json({ error: "Missing labor cost id" }, { status: 400 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify access
    const { data: laborCost } = await supabase
      .from("job_labor_costs")
      .select("workspace_id")
      .eq("id", laborCostId)
      .single();

    if (!laborCost) {
      return NextResponse.json({ error: "Labor cost not found" }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from("job_labor_costs")
      .delete()
      .eq("id", laborCostId);

    if (deleteError) {
      console.error(deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // Trigger recalculation
    await supabase.rpc("recalc_job_financials", { p_job_id: jobId });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Delete labor cost error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































