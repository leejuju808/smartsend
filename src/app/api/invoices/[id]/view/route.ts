// Block 39200 — SmartSend Roofing Invoice Engine
// POST /api/invoices/[id]/view
// Track when invoice is viewed (public endpoint)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: invoiceId } = await params;

    // Check if invoice exists
    const { data: invoice } = await supabase
      .from("invoices")
      .select("id, viewed_at")
      .eq("id", invoiceId)
      .single();

    if (!invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    // Update viewed_at if not already set
    if (!invoice.viewed_at) {
      await supabase
        .from("invoices")
        .update({ viewed_at: new Date().toISOString() })
        .eq("id", invoiceId);

      // Log viewed event
      await supabase.from("invoice_events").insert({
        invoice_id: invoiceId,
        event: "viewed",
        metadata: {},
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error tracking invoice view:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































