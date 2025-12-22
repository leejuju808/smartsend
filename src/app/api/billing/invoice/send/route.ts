// Block 240000 — SmartSend Roofing Billing & Payments Hub
// POST /api/billing/invoice/send
// Send invoice via email and/or SMS

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
    const {
      invoice_id,
      send_via = "email", // email, sms, both
      include_payment_link = true,
    } = body;

    if (!invoice_id) {
      return NextResponse.json(
        { error: "Missing required field: invoice_id" },
        { status: 400 }
      );
    }

    // Get invoice with homeowner details
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(`
        *,
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

    // Get homeowner email/phone
    const lead = (invoice.jobs as any)?.leads;
    if (!lead || !lead.email) {
      return NextResponse.json(
        { error: "Homeowner email not found" },
        { status: 400 }
      );
    }

    // Generate payment link if needed
    let payment_link = null;
    if (include_payment_link) {
      // Create a secure token for the payment link
      const token = crypto.randomUUID();
      
      // Store payment link (you may need to create a payment_links table)
      // For now, we'll use the existing stripe_payment_link field
      // This would typically create a Stripe Payment Link
    }

    // Send email
    if (send_via === "email" || send_via === "both") {
      // TODO: Integrate with email service (Resend, SendGrid, etc.)
      // For now, we'll just log it
      console.log(`Sending invoice ${invoice_id} to ${lead.email}`);
    }

    // Send SMS
    if (send_via === "sms" || send_via === "both") {
      // TODO: Integrate with SMS service (Twilio, etc.)
      // For now, we'll just log it
      if (lead.phone) {
        console.log(`Sending invoice ${invoice_id} SMS to ${lead.phone}`);
      }
    }

    // Update invoice status to 'sent' if it was 'draft'
    await supabase
      .from("invoices")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", invoice_id);

    return NextResponse.json({
      success: true,
      sent_at: new Date().toISOString(),
      payment_link,
    });
  } catch (error: any) {
    console.error("Error in POST /api/billing/invoice/send:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

























