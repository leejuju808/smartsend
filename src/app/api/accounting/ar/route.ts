import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/accounting/ar
 * Get Accounts Receivable summary and list
 * Query params: team_id, status (overdue, due_soon, all)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: teamMembers } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id);

    if (!teamMembers || teamMembers.length === 0) {
      return NextResponse.json({
        summary: {
          total_ar: 0,
          overdue_amount: 0,
          due_this_week: 0,
          paid_this_month: 0,
          unpaid_count: 0,
          overdue_count: 0,
        },
        invoices: [],
      });
    }

    const teamIds = teamMembers.map((tm) => tm.team_id);
    const teamId = searchParams.get("team_id");
    const status = searchParams.get("status") || "all";

    // Get AR summary from view
    const summaryQuery = supabase
      .from("ar_summary")
      .select("*")
      .in("team_id", teamIds);

    if (teamId && teamIds.includes(teamId)) {
      summaryQuery.eq("team_id", teamId);
    }

    const { data: summaries } = await summaryQuery;

    // Aggregate summary across teams
    const summary = {
      total_ar: 0,
      overdue_amount: 0,
      due_this_week: 0,
      paid_this_month: 0,
      unpaid_count: 0,
      overdue_count: 0,
    };

    if (summaries) {
      summaries.forEach((s: any) => {
        summary.total_ar += parseFloat(s.total_ar || 0);
        summary.overdue_amount += parseFloat(s.overdue_amount || 0);
        summary.due_this_week += parseFloat(s.due_this_week || 0);
        summary.paid_this_month += parseFloat(s.paid_this_month || 0);
        summary.unpaid_count += parseInt(s.unpaid_count || 0);
        summary.overdue_count += parseInt(s.overdue_count || 0);
      });
    }

    // Get invoice list based on status filter
    let invoiceQuery = supabase
      .from("invoices")
      .select(`
        id,
        invoice_number,
        invoice_type,
        total_amount,
        remaining_balance,
        status,
        due_date,
        invoice_date,
        jobs (
          id
        ),
        customers (
          id,
          name,
          email
        )
      `)
      .in("team_id", teamIds)
      .in("status", ["unpaid", "partially_paid", "overdue"]);

    if (teamId && teamIds.includes(teamId)) {
      invoiceQuery = invoiceQuery.eq("team_id", teamId);
    }

    if (status === "overdue") {
      invoiceQuery = invoiceQuery
        .eq("status", "overdue")
        .lt("due_date", new Date().toISOString().split("T")[0]);
    } else if (status === "due_soon") {
      const today = new Date();
      const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      invoiceQuery = invoiceQuery
        .gte("due_date", today.toISOString().split("T")[0])
        .lte("due_date", weekFromNow.toISOString().split("T")[0]);
    }

    invoiceQuery = invoiceQuery.order("due_date", { ascending: true });

    const { data: invoices, error } = await invoiceQuery;

    if (error) {
      console.error("Error fetching AR invoices:", error);
      return NextResponse.json(
        { error: "Failed to fetch AR data", details: error.message },
        { status: 500 }
      );
    }

    // Calculate days overdue for each invoice
    const invoicesWithDaysOverdue = (invoices || []).map((invoice: any) => {
      const dueDate = new Date(invoice.due_date);
      const today = new Date();
      const daysOverdue = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
      return {
        ...invoice,
        days_overdue: daysOverdue,
      };
    });

    return NextResponse.json({
      summary,
      invoices: invoicesWithDaysOverdue,
    });
  } catch (error: any) {
    console.error("Error in AR summary:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
