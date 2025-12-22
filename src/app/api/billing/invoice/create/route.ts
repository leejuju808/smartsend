// Block 240000 — SmartSend Roofing Billing & Payments Hub
// POST /api/billing/invoice/create
// Create a new invoice with line items

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";
import { stripe } from "@/src/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      job_id,
      homeowner_id,
      workspace_id,
      type = "deposit", // deposit, progress, final, change_order
      amount,
      line_items = [],
      due_date,
      notes,
      auto_send = false,
    } = body;

    // Validate required fields
    if (!homeowner_id || !workspace_id || !amount) {
      return NextResponse.json(
        { error: "Missing required fields: homeowner_id, workspace_id, amount" },
        { status: 400 }
      );
    }

    // Calculate total from line items if provided
    let calculatedTotal = amount;
    if (line_items && line_items.length > 0) {
      calculatedTotal = line_items.reduce(
        (sum: number, item: any) => sum + (item.total || (item.quantity * item.unit_price)),
        0
      );
    }

    // Generate invoice number
    const { data: invoiceNumberData } = await supabase.rpc('generate_invoice_number', {
      p_workspace_id: workspace_id
    });

    const invoice_number = invoiceNumberData || `INV-${Date.now()}`;

    // Create invoice
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        job_id: job_id || null,
        workspace_id,
        invoice_number,
        type,
        amount: calculatedTotal,
        due_date: due_date || null,
        status: "pending",
        notes: notes || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (invoiceError) {
      console.error("Error creating invoice:", invoiceError);
      return NextResponse.json(
        { error: "Failed to create invoice", details: invoiceError.message },
        { status: 500 }
      );
    }

    // Create line items if provided
    if (line_items && line_items.length > 0) {
      const lineItemsData = line_items.map((item: any) => ({
        invoice_id: invoice.id,
        description: item.description,
        quantity: item.quantity || 1,
        unit_price: item.unit_price || item.total || 0,
      }));

      const { error: lineItemsError } = await supabase
        .from("invoice_line_items")
        .insert(lineItemsData);

      if (lineItemsError) {
        console.error("Error creating line items:", lineItemsError);
        // Don't fail the request, just log the error
      }
    }

    // Auto-send if requested
    if (auto_send) {
      // This will be handled by the send endpoint
      // For now, we'll just return the invoice
    }

    return NextResponse.json({
      success: true,
      invoice,
    });
  } catch (error: any) {
    console.error("Error in POST /api/billing/invoice/create:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

























