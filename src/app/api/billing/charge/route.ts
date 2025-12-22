// Block 240000 — SmartSend Roofing Billing & Payments Hub
// POST /api/billing/charge
// Charge a saved payment method for an invoice

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
      invoice_id,
      payment_method_id, // Can be payment_methods.id or Stripe PaymentMethod ID
      amount, // Optional: if not provided, uses invoice balance
    } = body;

    if (!invoice_id || !payment_method_id) {
      return NextResponse.json(
        { error: "Missing required fields: invoice_id, payment_method_id" },
        { status: 400 }
      );
    }

    // Get invoice
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

    // Get payment method
    let stripePaymentMethodId: string;
    let methodRecord: any;

    // Check if it's a UUID (our payment_methods.id) or Stripe PaymentMethod ID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payment_method_id);

    if (isUUID) {
      const { data: method, error: methodError } = await supabase
        .from("payment_methods")
        .select("*")
        .eq("id", payment_method_id)
        .single();

      if (methodError || !method) {
        return NextResponse.json(
          { error: "Payment method not found" },
          { status: 404 }
        );
      }

      methodRecord = method;
      stripePaymentMethodId = method.stripe_payment_method_id;
    } else {
      stripePaymentMethodId = payment_method_id;
    }

    // Calculate amount to charge
    let chargeAmount = amount;
    if (!chargeAmount) {
      // Get total paid
      const { data: transactions } = await supabase
        .from("transactions")
        .select("amount")
        .eq("invoice_id", invoice_id)
        .eq("status", "succeeded");

      const totalPaid = transactions?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
      chargeAmount = Number(invoice.amount) - totalPaid;
    }

    if (chargeAmount <= 0) {
      return NextResponse.json(
        { error: "Invoice is already fully paid" },
        { status: 400 }
      );
    }

    // Get or create Stripe customer
    const lead = (invoice.jobs as any)?.leads;
    if (!lead?.email) {
      return NextResponse.json(
        { error: "Homeowner email not found" },
        { status: 400 }
      );
    }

    let customerId: string;
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
          homeowner_id: invoice.homeowner_id || "",
          workspace_id: invoice.workspace_id,
        },
      });
      customerId = customer.id;
    }

    // Attach payment method to customer if not already attached
    try {
      await stripe.paymentMethods.attach(stripePaymentMethodId, {
        customer: customerId,
      });
    } catch (error: any) {
      // Payment method might already be attached, that's okay
      if (!error.message.includes("already been attached")) {
        throw error;
      }
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(chargeAmount * 100), // Convert to cents
      currency: "usd",
      customer: customerId,
      payment_method: stripePaymentMethodId,
      confirmation_method: "automatic",
      confirm: true,
      metadata: {
        invoice_id: invoice.id,
        workspace_id: invoice.workspace_id,
      },
      description: `Invoice ${invoice.invoice_number}`,
    });

    // Create transaction record
    const transactionData: any = {
      invoice_id: invoice.id,
      stripe_payment_intent_id: paymentIntent.id,
      stripe_charge_id: paymentIntent.latest_charge as string || null,
      amount: chargeAmount,
      status: paymentIntent.status === "succeeded" ? "succeeded" : "pending",
      payment_type: methodRecord?.type === "ach" ? "ach" : "card",
    };

    if (methodRecord) {
      transactionData.method_id = methodRecord.id;
    }

    const { data: transaction, error: transactionError } = await supabase
      .from("transactions")
      .insert(transactionData)
      .select()
      .single();

    if (transactionError) {
      console.error("Error creating transaction:", transactionError);
    }

    // Also create/update payment record for backward compatibility
    if (paymentIntent.status === "succeeded") {
      await supabase
        .from("payments")
        .insert({
          invoice_id: invoice.id,
          stripe_payment_intent: paymentIntent.id,
          stripe_charge_id: paymentIntent.latest_charge as string || null,
          amount: chargeAmount,
          status: "succeeded",
          received_at: new Date().toISOString(),
        });
    }

    // Refresh invoice status
    await supabase.rpc("refresh_invoice_status", {
      p_invoice_id: invoice.id,
    });

    return NextResponse.json({
      success: true,
      payment_intent: {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: chargeAmount,
      },
      transaction,
    });
  } catch (error: any) {
    console.error("Error in POST /api/billing/charge:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

























