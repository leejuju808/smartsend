// Block 240000 — SmartSend Roofing Billing & Payments Hub
// POST /api/billing/qbo/push
// Sync invoice to QuickBooks Online

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { invoice_id } = body;

    if (!invoice_id) {
      return NextResponse.json(
        { error: "Missing required field: invoice_id" },
        { status: 400 }
      );
    }

    // Get invoice with line items
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(`
        *,
        invoice_line_items (*),
        jobs:job_id (
          id,
          lead_id,
          leads:lead_id (
            id,
            email,
            first_name,
            last_name,
            phone
          )
        )
      `)
      .eq("id", invoice_id)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    // Check if QuickBooks is configured for this workspace
    // TODO: Check workspace integrations table for QuickBooks credentials
    // For now, we'll just create a sync record

    // Create/update QuickBooks sync record
    const { data: existingSync } = await supabase
      .from("quickbooks_sync")
      .select("*")
      .eq("invoice_id", invoice_id)
      .maybeSingle();

    if (existingSync && existingSync.sync_status === "synced") {
      return NextResponse.json({
        success: true,
        message: "Invoice already synced to QuickBooks",
        qbo_invoice_id: existingSync.qbo_invoice_id,
      });
    }

    // TODO: Actual QuickBooks API integration
    // This would use the QuickBooks API to:
    // 1. Get or create customer
    // 2. Create invoice
    // 3. Add line items
    // 4. Return QBO invoice ID

    // For now, we'll simulate the sync
    const qboInvoiceId = `QBO-${Date.now()}`;
    const qboCustomerId = `QBO-CUST-${Date.now()}`;

    const syncData: any = {
      invoice_id: invoice_id,
      workspace_id: invoice.workspace_id,
      qbo_invoice_id: qboInvoiceId,
      qbo_customer_id: qboCustomerId,
      sync_status: "synced",
      synced_at: new Date().toISOString(),
    };

    if (existingSync) {
      const { data: updatedSync, error: updateError } = await supabase
        .from("quickbooks_sync")
        .update(syncData)
        .eq("id", existingSync.id)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json(
          { error: "Failed to update QuickBooks sync", details: updateError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        sync: updatedSync,
      });
    } else {
      const { data: newSync, error: insertError } = await supabase
        .from("quickbooks_sync")
        .insert(syncData)
        .select()
        .single();

      if (insertError) {
        console.error("Error creating QuickBooks sync:", insertError);
        return NextResponse.json(
          { error: "Failed to create QuickBooks sync", details: insertError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        sync: newSync,
      });
    }
  } catch (error: any) {
    console.error("Error in POST /api/billing/qbo/push:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

























