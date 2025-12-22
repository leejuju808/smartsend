// Block 39200 — SmartSend Roofing Invoice Engine
// GET /api/invoices/[id]/pay
// Get invoice details for payment page (public endpoint)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: invoiceId } = await params;

    // Get invoice with job and lead details
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(`
        id,
        invoice_number,
        amount,
        balance_due,
        due_date,
        status,
        type,
        created_at,
        roofing_job_id,
        lead_id,
        roofing_jobs:roofing_job_id (
          id,
          title,
          job_value
        ),
        leads:lead_id (
          id,
          first_name,
          last_name,
          email
        )
      `)
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    // Get payment history
    const { data: payments } = await supabase
      .from("payments")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: false });

    // Get invoice events
    const { data: events } = await supabase
      .from("invoice_events")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("created_at", { ascending: false });

    return NextResponse.json({
      invoice,
      payments: payments || [],
      events: events || [],
    });
  } catch (error: any) {
    console.error("Error fetching invoice:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































