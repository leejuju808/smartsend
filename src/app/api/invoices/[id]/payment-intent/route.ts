// Block 39200 — SmartSend Roofing Invoice Engine
// POST /api/invoices/[id]/payment-intent
// Create Stripe payment intent for invoice

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: invoiceId } = await params;
    const supabase = await getServerSupabase();

    // Get invoice details
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(`
        id,
        amount,
        balance_due,
        lead_id,
        workspace_id,
        status,
        stripe_payment_intent_id
      `)
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    if (invoice.status === "paid") {
      return NextResponse.json(
        { error: "Invoice is already paid" },
        { status: 400 }
      );
    }

    // Get lead details for customer
    const { data: lead } = await supabase
      .from("leads")
      .select("email, first_name, last_name, phone")
      .eq("id", invoice.lead_id)
      .single();

    // Get or create Stripe customer
    let customerId: string;
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("stripe_customer_id")
      .eq("id", invoice.workspace_id)
      .single();

    // For now, create a customer per invoice (can be optimized later)
    const customer = await stripe.customers.create({
      email: lead?.email || undefined,
      name: lead?.first_name && lead?.last_name
        ? `${lead.first_name} ${lead.last_name}`
        : undefined,
      phone: lead?.phone || undefined,
      metadata: {
        invoice_id: invoice.id,
        lead_id: invoice.lead_id || "",
        workspace_id: invoice.workspace_id,
      },
    });
    customerId = customer.id;

    // Use existing payment intent if available and not succeeded
    if (invoice.stripe_payment_intent_id) {
      try {
        const existingIntent = await stripe.paymentIntents.retrieve(
          invoice.stripe_payment_intent_id
        );

        if (existingIntent.status !== "succeeded") {
          return NextResponse.json({
            client_secret: existingIntent.client_secret,
            payment_intent_id: existingIntent.id,
          });
        }
      } catch (e) {
        // Payment intent doesn't exist, create new one
      }
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(Number(invoice.balance_due) * 100), // Convert to cents
      currency: "usd",
      customer: customerId,
      payment_method_types: ["card", "us_bank_account"], // Card + ACH
      metadata: {
        invoice_id: invoice.id,
        lead_id: invoice.lead_id || "",
        workspace_id: invoice.workspace_id,
      },
      description: `Invoice ${invoice.id}`,
    });

    // Update invoice with payment intent ID
    await supabase
      .from("invoices")
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq("id", invoice.id);

    return NextResponse.json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
    });
  } catch (error: any) {
    console.error("Error creating payment intent:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create payment intent" },
      { status: 500 }
    );
  }
}
































