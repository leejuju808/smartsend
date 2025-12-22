// Block 25340 — SmartSend Roofing Job Costing & Profit Engine v1
// API Route: Create/Update Addon Costs (Wood, Dumpster, Repairs, etc.)

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
      addon_type,
      description,
      quantity,
      unit,
      unit_cost,
      is_supplement_eligible,
      supplement_status,
      supplement_amount,
    } = body;

    if (!addon_type || !description || !unit_cost) {
      return NextResponse.json(
        { error: "Missing required fields: addon_type, description, unit_cost" },
        { status: 400 }
      );
    }

    const addonData: any = {
      job_id: jobId,
      workspace_id: job.workspace_id,
      addon_type,
      description,
      quantity: quantity || 1,
      unit: unit || null,
      unit_cost,
      is_supplement_eligible: is_supplement_eligible || false,
      supplement_status: supplement_status || 'not_submitted',
      supplement_amount: supplement_amount || null,
      added_by: user.id,
    };

    let result;
    if (id) {
      // Update existing entry
      const { data, error } = await supabase
        .from("job_addon_costs")
        .update(addonData)
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
        .from("job_addon_costs")
        .insert(addonData)
        .select()
        .single();

      if (error) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      result = data;
    }

    // Trigger recalculation (should happen automatically via trigger)
    await supabase.rpc("recalc_job_financials", { p_job_id: jobId });

    return NextResponse.json({ success: true, addon_cost: result });
  } catch (error: any) {
    console.error("Addon cost error:", error);
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

    // Get addon costs
    const { data: addonCosts, error } = await supabase
      .from("job_addon_costs")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ addon_costs: addonCosts || [] });
  } catch (error: any) {
    console.error("Get addon costs error:", error);
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
    const addonCostId = searchParams.get("id");

    if (!addonCostId) {
      return NextResponse.json({ error: "Missing addon cost id" }, { status: 400 });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error: deleteError } = await supabase
      .from("job_addon_costs")
      .delete()
      .eq("id", addonCostId);

    if (deleteError) {
      console.error(deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // Trigger recalculation
    await supabase.rpc("recalc_job_financials", { p_job_id: jobId });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Delete addon cost error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































