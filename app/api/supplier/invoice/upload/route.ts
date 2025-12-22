// Block 241000 — SmartSend Roofing Supplier Hub v1
// POST /api/supplier/invoice/upload
// Upload supplier invoice for reconciliation

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      po_id,
      invoice_number,
      invoice_url, // URL to uploaded invoice PDF/image (should be uploaded to storage first)
      amount,
      notes,
    } = body;

    if (!po_id || !amount) {
      return NextResponse.json(
        { error: "po_id and amount are required" },
        { status: 400 }
      );
    }

    // Verify PO exists
    const { data: po, error: poError } = await supabase
      .from("purchase_orders")
      .select("id, total_cost")
      .eq("id", po_id)
      .single();

    if (poError || !po) {
      return NextResponse.json(
        { error: "Purchase order not found" },
        { status: 404 }
      );
    }

    // Create invoice record (po_amount will be auto-populated by trigger)
    const { data: invoice, error: invoiceError } = await supabase
      .from("supplier_invoices")
      .insert({
        po_id,
        invoice_number: invoice_number || null,
        invoice_url: invoice_url || null,
        amount,
        uploaded_by: user.id,
        notes: notes || null,
        reconciled: false,
      })
      .select()
      .single();

    if (invoiceError) {
      console.error("Invoice upload error:", invoiceError);
      return NextResponse.json(
        { error: "Failed to upload invoice" },
        { status: 500 }
      );
    }

    // Fetch complete invoice with PO details
    const { data: completeInvoice, error: fetchError } = await supabase
      .from("supplier_invoices")
      .select(`
        *,
        purchase_orders:po_id (
          *,
          po_items (*),
          suppliers (*)
        )
      `)
      .eq("id", invoice.id)
      .single();

    // Check for variance and flag if significant
    const variance = completeInvoice?.variance || 0;
    const variancePercent = completeInvoice?.variance_percent || 0;

    // TODO: Send alert if variance > threshold (e.g., 5% or $100)

    return NextResponse.json({ 
      invoice: completeInvoice || invoice,
      message: "Invoice uploaded successfully",
      variance: {
        amount: variance,
        percent: variancePercent,
        flagged: Math.abs(variancePercent) > 5 || Math.abs(variance) > 100,
      },
    });
  } catch (error: any) {
    console.error("Error in POST /api/supplier/invoice/upload:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























