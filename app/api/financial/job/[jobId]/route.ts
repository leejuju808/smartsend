import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/financial/job/[jobId]
 * Get real-time job financials (profit brain)
 */
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

  try {
    // Get workspace_id
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: "No workspace found" }, { status: 404 });
    }

    // Calculate/refresh job profit
    const { data: profitData, error: profitError } = await supabase.rpc(
      "calculate_job_profit",
      { p_job_id: jobId }
    );

    if (profitError) {
      console.error("Profit calculation error:", profitError);
      // Continue even if calculation fails, try to get existing data
    }

    // Get job financials
    const { data: financials, error: financialsError } = await supabase
      .from("job_financials")
      .select("*")
      .eq("job_id", jobId)
      .maybeSingle();

    if (financialsError && financialsError.code !== "PGRST116") {
      return NextResponse.json(
        { error: financialsError.message },
        { status: 500 }
      );
    }

    // Get cost overruns
    const { data: overruns, error: overrunsError } = await supabase
      .from("cost_overruns")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, title, status, job_type, contract_value, final_value, estimated_value")
      .eq("id", jobId)
      .maybeSingle();

    return NextResponse.json({
      financials: financials || null,
      overruns: overruns || [],
      job: job || null,
      calculated: profitData || null,
    });
  } catch (error: any) {
    console.error("Get job financials error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/financial/job/[jobId]
 * Update job financials (manual override if needed)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const supabase = createClient();
  const { jobId } = await params;

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { contract_price, estimated_cost, material_cost, labor_cost, sub_cost } = body;

    // Get job to find company_id and workspace_id
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("company_id, workspace_id")
      .eq("id", jobId)
      .maybeSingle();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Upsert job financials
    const { data, error } = await supabase
      .from("job_financials")
      .upsert({
        job_id: jobId,
        company_id: job.company_id,
        workspace_id: job.workspace_id,
        contract_price: contract_price,
        estimated_cost: estimated_cost,
        material_cost: material_cost,
        labor_cost: labor_cost,
        sub_cost: sub_cost,
      }, {
        onConflict: "job_id",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ financials: data });
  } catch (error: any) {
    console.error("Update job financials error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






















