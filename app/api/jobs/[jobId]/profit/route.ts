// Block 26020 — SmartSend Roofing Profit Engine v1
// API route to fetch profit data for a job

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const supabase = createClient();
  const { jobId } = await params;

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace_id from workspace_members
  const { data: membership, error: memError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memError || !membership) {
    return NextResponse.json({ error: "No workspace found" }, { status: 404 });
  }

  const workspaceId = membership.workspace_id;

  try {
    // Get profit record, recalculate if it doesn't exist
    let { data: profit, error: profitError } = await supabase
      .from("roofing_job_profit")
      .select("*")
      .eq("job_id", jobId)
      .eq("workspace_id", workspaceId)
      .single();

    // If profit record doesn't exist, try to recalculate
    if (profitError || !profit) {
      const { error: recalcError } = await supabase.rpc("recalc_job_profit", {
        p_job_id: jobId,
      });

      if (recalcError) {
        console.error("Recalc error:", recalcError);
      }

      // Retry fetching profit
      const { data: retryProfit } = await supabase
        .from("roofing_job_profit")
        .select("*")
        .eq("job_id", jobId)
        .eq("workspace_id", workspaceId)
        .single();

      profit = retryProfit;
    }

    if (!profit) {
      return NextResponse.json(
        { error: "Profit data not available for this job" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        job_id: profit.job_id,
        estimated_revenue: profit.estimated_revenue || 0,
        final_revenue: profit.final_revenue || profit.estimated_revenue || 0,
        material_cost: profit.material_cost || 0,
        labor_cost: profit.labor_cost || 0,
        supplement_revenue: profit.supplement_revenue || 0,
        gross_profit: profit.gross_profit || 0,
        margin: profit.margin || 0,
        updated_at: profit.updated_at,
      },
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Get profit error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































