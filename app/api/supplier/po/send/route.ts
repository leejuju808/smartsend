// Block 241000 — SmartSend Roofing Supplier Hub v1
// POST /api/supplier/po/send
// Send PO to supplier (generate PDF + send via email/SMS)

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
      send_method, // 'email', 'sms', or 'both'
    } = body;

    if (!po_id) {
      return NextResponse.json(
        { error: "po_id is required" },
        { status: 400 }
      );
    }

    // Fetch PO with supplier and items
    const { data: po, error: poError } = await supabase
      .from("purchase_orders")
      .select(`
        *,
        po_items (*),
        suppliers (*)
      `)
      .eq("id", po_id)
      .single();

    if (poError || !po) {
      return NextResponse.json(
        { error: "Purchase order not found" },
        { status: 404 }
      );
    }

    if (po.status !== 'pending') {
      return NextResponse.json(
        { error: `PO already sent (current status: ${po.status})` },
        { status: 400 }
      );
    }

    // Generate PDF (TODO: Implement actual PDF generation)
    // For now, we'll create a placeholder URL
    const pdfUrl = `/api/supplier/po/${po_id}/pdf`;
    
    // TODO: Generate actual PDF using a PDF library (puppeteer, pdfkit, etc.)
    // The PDF should include:
    // - Company header/logo
    // - PO number and date
    // - Supplier info
    // - Job info (if applicable)
    // - Items table
    // - Total cost
    // - Delivery date and instructions
    // - Notes

    // Update PO with PDF URL and status
    const { data: updatedPo, error: updateError } = await supabase
      .from("purchase_orders")
      .update({
        pdf_url: pdfUrl,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .eq("id", po_id)
      .select()
      .single();

    if (updateError) {
      console.error("PO update error:", updateError);
      return NextResponse.json(
        { error: "Failed to update PO status" },
        { status: 500 }
      );
    }

    // Send notification to supplier
    const supplier = po.suppliers;
    const sendMethod = send_method || 'email';

    // TODO: Implement email/SMS sending
    // Email: Send PO PDF as attachment to supplier.email
    // SMS: Send PO summary and link to supplier.phone
    
    // For now, return success with note about notification
    return NextResponse.json({ 
      po: updatedPo,
      message: "PO sent successfully",
      note: "Email/SMS notification to supplier needs to be implemented",
      pdf_url: pdfUrl,
    });
  } catch (error: any) {
    console.error("Error in POST /api/supplier/po/send:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























