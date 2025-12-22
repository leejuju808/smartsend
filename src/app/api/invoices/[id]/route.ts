import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * GET /api/invoices/[id]
 * Get a single invoice with all related data
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const supabase = getServerSupabase();

    const { data: invoice, error } = await supabase
      .from("invoices")
      .select(`
        *,
        payment_milestones (
          *,
          payment_schedules (
            *,
            contract_documents (
              *,
              leads (
                first_name,
                last_name,
                email,
                phone
              )
            ),
            roofing_jobs (
              title,
              address
            )
          )
        )
      `)
      .eq("id", id)
      .single();

    if (error || !invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ invoice });
  } catch (error: any) {
    console.error("Error fetching invoice:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

























