import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/accounting/invoices/[id]
 * Get a single invoice with all related data
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

    const { data: invoice, error } = await supabase
      .from("invoices")
      .select(`
        *,
        jobs (
          id,
          stage,
          contract_value,
          notes
        ),
        customers (
          id,
          name,
          email,
          phone,
          address,
          city,
          state,
          zip_code
        ),
        payments (
          id,
          amount,
          payment_method,
          payment_reference,
          received_at,
          note,
          recorded_by:users!payments_recorded_by_fkey (
            id,
            email
          )
        ),
        ar_followups (
          id,
          followup_type,
          next_step,
          due_date,
          status,
          completed_at,
          auto_sent,
          sent_at
        ),
        insurance_tracking (
          id,
          claim_number,
          insurance_company,
          acv_amount,
          acv_received,
          depreciation_amount,
          depreciation_received,
          deductible_amount,
          deductible_collected,
          supplement_amount,
          supplement_pending,
          status
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

    // Verify user has access to this invoice's team
    const { data: teamMember } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("team_id", invoice.team_id)
      .eq("user_id", user.id)
      .single();

    if (!teamMember) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
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

/**
 * PATCH /api/accounting/invoices/[id]
 * Update an invoice
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const body = await req.json();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get invoice to verify access
    const { data: invoice } = await supabase
      .from("invoices")
      .select("team_id")
      .eq("id", id)
      .single();

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Verify access
    const { data: teamMember } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("team_id", invoice.team_id)
      .eq("user_id", user.id)
      .single();

    if (!teamMember) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Update invoice
    const { data: updatedInvoice, error } = await supabase
      .from("invoices")
      .update({
        ...body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating invoice:", error);
      return NextResponse.json(
        { error: "Failed to update invoice", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ invoice: updatedInvoice });
  } catch (error: any) {
    console.error("Error updating invoice:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
