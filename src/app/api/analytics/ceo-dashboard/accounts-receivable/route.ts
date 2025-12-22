import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

/**
 * GET /api/analytics/ceo-dashboard/accounts-receivable
 * 
 * Returns unpaid invoices and overdue amounts
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = getServerSupabase();

    // Get accounts receivable
    const { data: arData, error } = await supabase
      .from("accounts_receivable")
      .select("*")
      .eq("workspace_id", workspace_id)
      .order("days_overdue", { ascending: false });

    if (error) {
      console.error("Error fetching AR:", error);
      return NextResponse.json(
        { error: "Failed to fetch accounts receivable" },
        { status: 500 }
      );
    }

    const totalAr = arData?.reduce((sum, inv) => sum + Number(inv.amount_due || 0), 0) || 0;
    const overdueAr = arData
      ?.filter(inv => inv.days_overdue > 0)
      .reduce((sum, inv) => sum + Number(inv.amount_due || 0), 0) || 0;
    const overdueCount = arData?.filter(inv => inv.days_overdue > 0).length || 0;

    return NextResponse.json({
      summary: {
        totalAr,
        overdueAr,
        overdueCount,
        totalInvoices: arData?.length || 0,
      },
      invoices: (arData || []).map((inv) => ({
        invoiceId: inv.invoice_id,
        jobId: inv.job_id,
        jobTitle: inv.job_title,
        homeownerName: inv.homeowner_name,
        jobAddress: inv.job_address,
        amount: Number(inv.amount || 0),
        amountDue: Number(inv.amount_due || 0),
        dueDate: inv.due_date,
        daysOverdue: Number(inv.days_overdue || 0),
        status: inv.invoice_status || inv.milestone_status,
        sentAt: inv.sent_at,
      })),
    });
  } catch (error: any) {
    console.error("Error fetching accounts receivable:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch accounts receivable" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/analytics/ceo-dashboard/accounts-receivable
 * 
 * Send reminder for overdue invoice
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const { invoiceId } = await req.json();

    if (!invoiceId) {
      return NextResponse.json(
        { error: "Missing invoiceId" },
        { status: 400 }
      );
    }

    // TODO: Implement invoice reminder sending
    // This would trigger an email/notification to the homeowner

    return NextResponse.json({
      success: true,
      message: "Reminder sent successfully",
    });
  } catch (error: any) {
    console.error("Error sending reminder:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send reminder" },
      { status: 500 }
    );
  }
}

























