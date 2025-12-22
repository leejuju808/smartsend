import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

/**
 * POST /api/stripe/create-intent
 * Creates a Stripe payment intent for an invoice
 * 
 * Input: { invoice_id }
 * Output: { client_secret, payment_intent_id }
 */
export async function POST(req: NextRequest) {
  try {
    const { invoice_id } = await req.json();

    if (!invoice_id) {
      return NextResponse.json(
        { error: "invoice_id is required" },
        { status: 400 }
      );
    }

    const supabase = getServerSupabase();

    // Fetch invoice with related data
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(`
        *,
        payment_milestones (
          *,
          payment_schedules (
            *,
            contract_documents (
              *,
              leads (
                first_name,
                last_name,
                email,
                phone
              )
            )
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

    const milestone = invoice.payment_milestones;
    if (!milestone) {
      return NextResponse.json(
        { error: "Milestone not found" },
        { status: 404 }
      );
    }

    const schedule = milestone.payment_schedules;
    if (!schedule) {
      return NextResponse.json(
        { error: "Payment schedule not found" },
        { status: 404 }
      );
    }

    const contract = schedule.contract_documents;
    const lead = contract?.leads;

    // Check if payment intent already exists and is not succeeded
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

    // Get or create Stripe customer
    let customerId: string | undefined;

    if (lead?.email) {
      // Try to find existing customer by email
      const customers = await stripe.customers.list({
        email: lead.email,
        limit: 1,
      });

      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        // Create new customer
        const customer = await stripe.customers.create({
          email: lead.email,
          name: lead.first_name && lead.last_name
            ? `${lead.first_name} ${lead.last_name}`
            : undefined,
          phone: lead.phone || undefined,
          metadata: {
            invoice_id: invoice.id,
            milestone_id: milestone.id,
            schedule_id: schedule.id,
            workspace_id: schedule.workspace_id,
          },
        });
        customerId = customer.id;
      }
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(Number(milestone.amount) * 100), // Convert to cents
      currency: "usd",
      customer: customerId,
      payment_method_types: ["card", "us_bank_account"], // Card + ACH
      metadata: {
        invoice_id: invoice.id,
        milestone_id: milestone.id,
        schedule_id: schedule.id,
        workspace_id: schedule.workspace_id,
      },
      description: `Invoice ${invoice.invoice_number} - ${milestone.label}`,
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
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

























