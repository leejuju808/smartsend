import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const supabase = createClient();

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
  const jobId = params.jobId;

  try {
    // Get job financials
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select(`
        id,
        title,
        job_value,
        revenue_collected,
        actual_material_cost,
        actual_labor_cost,
        actual_other_cost,
        actual_total_cost,
        actual_gross_profit,
        actual_margin_pct,
        est_material_cost,
        est_labor_cost,
        est_other_cost,
        est_gross_profit,
        est_margin_pct,
        status,
        scheduled_start_date,
        scheduled_end_date,
        workspace_id
      `)
      .eq("id", jobId)
      .eq("workspace_id", workspaceId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: jobError?.message || "Job not found" },
        { status: 404 }
      );
    }

    // Get cost entries
    const { data: costEntries, error: costError } = await supabase
      .from("job_cost_entries")
      .select("*")
      .eq("job_id", jobId)
      .order("cost_date", { ascending: true });

    if (costError) {
      console.error(costError);
      return NextResponse.json(
        { error: costError.message },
        { status: 500 }
      );
    }

    // Get payments
    const { data: payments, error: payError } = await supabase
      .from("job_payments")
      .select("*")
      .eq("job_id", jobId)
      .order("received_at", { ascending: true });

    if (payError) {
      console.error(payError);
      return NextResponse.json(
        { error: payError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        job,
        costEntries: costEntries || [],
        payments: payments || [],
      },
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Get financials error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}








































