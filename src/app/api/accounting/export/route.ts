import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exportInvoicesForAccounting } from "@/lib/accounting-sync";

/**
 * GET /api/accounting/export
 * Export invoices as CSV for accounting import
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const teamId = searchParams.get("team_id");
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    if (!teamId) {
      return NextResponse.json(
        { error: "team_id is required" },
        { status: 400 }
      );
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify access
    const { data: teamMember } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .single();

    if (!teamMember) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const csv = await exportInvoicesForAccounting(
      supabase,
      teamId,
      startDate || undefined,
      endDate || undefined
    );

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="invoices-export-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error: any) {
    console.error("Error exporting invoices:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}














