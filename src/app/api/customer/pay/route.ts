// Block 243000 — SmartSend Roofing CX Hub
// POST /api/customer/pay
// Process customer payment (integrates with Stripe)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { homeowner_id, job_id, invoice_id, amount, payment_method_id, stripe_customer_id } = body;

    if (!job_id || !amount) {
      return NextResponse.json(
        { error: "job_id and amount are required" },
        { status: 400 }
      );
    }

    // In production, this would integrate with Stripe to process the payment
    // For now, we'll create a payment record and let the trigger handle notifications

    // Get invoice if provided
    let invoice = null;
    if (invoice_id) {
      const { data: inv } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoice_id)
        .single();
      invoice = inv;
    }

    // Create payment record
    const { data: payment, error: insertError } = await supabase
      .from("payments")
      .insert({
        homeowner_id: homeowner_id || null,
        job_id,
        invoice_id: invoice_id || null,
        amount,
        status: "pending", // Would be updated to "completed" after Stripe confirmation
        payment_method: payment_method_id ? "stripe" : "other",
        metadata: {
          stripe_customer_id,
          payment_method_id,
        },
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating payment:", insertError);
      return NextResponse.json(
        { error: "Failed to create payment" },
        { status: 500 }
      );
    }

    // In production, you would:
    // 1. Create Stripe PaymentIntent
    // 2. Confirm payment
    // 3. Update payment status to "completed"
    // 4. The trigger will auto-notify customer

    // For now, return payment intent info
    return NextResponse.json({
      ok: true,
      payment,
      client_secret: null, // Would be from Stripe PaymentIntent
      message: "Payment processing - in production this would integrate with Stripe",
    });
  } catch (error: any) {
    console.error("Error in payment API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























