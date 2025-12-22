import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getCurrentWorkspaceId } from "@/lib/workspace";

/**
 * GET /api/billing/dashboard
 * Get payment tracking dashboard data
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace required" },
        { status: 400 }
      );
    }

    // Get summary from view
    const { data: summary } = await supabase
      .from("invoice_summary")
      .select("*")
      .eq("workspace_id", workspaceId)
      .single();

    // Get unpaid invoices list
    const { data: unpaidInvoices } = await supabase
      .from("unpaid_invoices_list")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("days_overdue", { ascending: false })
      .limit(20);

    // Get recent payments
    const { data: recentPayments } = await supabase
      .from("payments")
      .select(`
        *,
        invoices!inner(invoice_number, job_id, customer_id)
      `)
      .eq("workspace_id", workspaceId)
      .eq("status", "completed")
      .order("date", { ascending: false })
      .limit(10);

    return NextResponse.json({
      summary: summary || {
        outstanding_count: 0,
        outstanding_amount: 0,
        overdue_count: 0,
        overdue_amount: 0,
        due_this_week_count: 0,
        due_this_week_amount: 0,
      },
      unpaid_invoices: unpaidInvoices || [],
      recent_payments: recentPayments || [],
    });
  } catch (error: any) {
    console.error("Error in GET /api/billing/dashboard:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}






















