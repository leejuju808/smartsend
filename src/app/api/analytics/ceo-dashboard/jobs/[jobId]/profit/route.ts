import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

/**
 * GET /api/analytics/ceo-dashboard/jobs/[jobId]/profit
 * 
 * Returns profitability breakdown for a specific job
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const { jobId } = params;
    const supabase = getServerSupabase();

    // Get job profitability
    const { data: profitability, error } = await supabase
      .from("job_profitability")
      .select("*")
      .eq("job_id", jobId)
      .eq("workspace_id", workspace_id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch job profitability" },
        { status: 500 }
      );
    }

    if (!profitability) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Get job details for additional context
    const { data: job } = await supabase
      .from("roofing_jobs")
      .select("title, status, scheduled_start_date, scheduled_end_date")
      .eq("id", jobId)
      .eq("workspace_id", workspace_id)
      .maybeSingle();

    // Get change orders and supplements if available
    const { data: changeOrders } = await supabase
      .from("invoices")
      .select("amount, type")
      .eq("job_id", jobId)
      .eq("type", "change_order");

    const changeOrderProfit = changeOrders?.reduce(
      (sum, co) => sum + Number(co.amount || 0),
      0
    ) || 0;

    return NextResponse.json({
      jobId,
      jobTitle: job?.title || "Untitled Job",
      status: job?.status,
      revenue: Number(profitability.revenue || 0),
      costs: {
        materials: Number(profitability.materials_cost || 0),
        labor: Number(profitability.labor_cost || 0),
        other: Number(profitability.other_cost || 0),
        total: Number(profitability.total_cost || 0),
      },
      profit: {
        gross: Number(profitability.gross_profit || 0),
        marginPct: Number(profitability.margin_pct || 0),
        changeOrders: changeOrderProfit,
        supplementProfit: 0, // TODO: Add supplement tracking
      },
      dates: {
        scheduledStart: job?.scheduled_start_date,
        scheduledEnd: job?.scheduled_end_date,
      },
    });
  } catch (error: any) {
    console.error("Error fetching job profitability:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch job profitability" },
      { status: 500 }
    );
  }
}

























