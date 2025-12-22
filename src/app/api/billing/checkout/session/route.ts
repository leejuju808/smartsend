// Block 240000 — SmartSend Roofing Billing & Payments Hub
// POST /api/billing/checkout/session
// Create Stripe Checkout Session for invoice payment

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";
import { stripe } from "@/src/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const body = await req.json();
    const {
      invoice_id,
      success_url,
      cancel_url,
    } = body;

    if (!invoice_id) {
      return NextResponse.json(
        { error: "Missing required field: invoice_id" },
        { status: 400 }
      );
    }

    // Get invoice details
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
            last_name
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

    const lead = (invoice.jobs as any)?.leads;
    const amount = Number(invoice.amount) * 100; // Convert to cents

    // Get or create Stripe customer
    let customerId: string;
    if (lead?.email) {
      const customers = await stripe.customers.list({
        email: lead.email,
        limit: 1,
      });

      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        const customer = await stripe.customers.create({
          email: lead.email,
          name: lead.first_name && lead.last_name
            ? `${lead.first_name} ${lead.last_name}`
            : undefined,
          metadata: {
            invoice_id: invoice.id,
            workspace_id: invoice.workspace_id,
          },
        });
        customerId = customer.id;
      }
    } else {
      return NextResponse.json(
        { error: "Homeowner email not found" },
        { status: 400 }
      );
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card", "us_bank_account"], // Card + ACH
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Invoice ${invoice.invoice_number}`,
              description: invoice.notes || `Payment for ${invoice.type} invoice`,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: success_url || `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/payments/cancel`,
      metadata: {
        invoice_id: invoice.id,
        workspace_id: invoice.workspace_id,
        invoice_type: invoice.type,
      },
    });

    return NextResponse.json({
      session_id: session.id,
      url: session.url,
    });
  } catch (error: any) {
    console.error("Error in POST /api/billing/checkout/session:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

























