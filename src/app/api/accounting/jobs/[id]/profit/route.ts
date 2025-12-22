import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateJobProfit } from "@/lib/accounting";

/**
 * GET /api/accounting/jobs/[id]/profit
 * Get job profit snapshot
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get job to verify access
    const { data: job } = await supabase
      .from("jobs")
      .select("team_id")
      .eq("id", id)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Verify access
    const { data: teamMember } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("team_id", job.team_id)
      .eq("user_id", user.id)
      .single();

    if (!teamMember) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Calculate profit
    const profit = await calculateJobProfit(supabase, id);

    // Get invoiced and paid amounts
    const { data: invoices } = await supabase
      .from("invoices")
      .select("total_amount, paid_amount")
      .eq("job_id", id);

    const invoicedAmount =
      invoices?.reduce(
        (sum, inv) => sum + parseFloat(inv.total_amount || "0"),
        0
      ) || 0;

    const paidAmount =
      invoices?.reduce(
        (sum, inv) => sum + parseFloat(inv.paid_amount || "0"),
        0
      ) || 0;

    // Get cost breakdown
    const { data: costs } = await supabase
      .from("job_costs")
      .select("*")
      .eq("job_id", id)
      .single();

    return NextResponse.json({
      job_id: id,
      revenue: profit.revenue,
      costs: {
        materials: parseFloat(costs?.materials_cost || "0"),
        labor: parseFloat(costs?.labor_cost || "0"),
        subcontractor: parseFloat(costs?.subcontractor_cost || "0"),
        equipment: parseFloat(costs?.equipment_cost || "0"),
        permit: parseFloat(costs?.permit_cost || "0"),
        overhead: parseFloat(costs?.overhead_allocation || "0"),
        other: parseFloat(costs?.other_costs || "0"),
        total: profit.total_cost,
      },
      profit: profit.profit,
      profit_margin_percent: profit.profit_margin_percent,
      invoiced_amount: invoicedAmount,
      paid_amount: paidAmount,
      outstanding: invoicedAmount - paidAmount,
    });
  } catch (error: any) {
    console.error("Error calculating job profit:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
