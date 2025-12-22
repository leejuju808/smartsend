import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/src/lib/stripe";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/webhooks/stripe-payments
 * Handle Stripe webhook events for payment links and payments
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "No signature provided" },
      { status: 400 }
    );
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return NextResponse.json(
      { error: `Webhook Error: ${err.message}` },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "payment_link.payment_succeeded": {
        const paymentLink = event.data.object;
        await handlePaymentLinkSuccess(paymentLink);
        break;
      }

      case "checkout.session.completed": {
        const session = event.data.object;
        await handleCheckoutSessionCompleted(session);
        break;
      }

      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;
        await handlePaymentIntentSucceeded(paymentIntent);
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object;
        await handlePaymentIntentFailed(paymentIntent);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Error processing webhook:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

async function handlePaymentLinkSuccess(paymentLink: any) {
  const invoiceId = paymentLink.metadata?.invoice_id;
  const amount = paymentLink.amount_total / 100; // Convert from cents

  if (!invoiceId) {
    console.error("No invoice_id in payment link metadata");
    return;
  }

  // Get invoice
  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();

  if (!invoice) {
    console.error("Invoice not found:", invoiceId);
    return;
  }

  // Create payment record
  const { error: paymentError } = await supabase.from("payments").insert({
    org_id: invoice.org_id,
    invoice_id: invoiceId,
    job_id: invoice.job_id,
    amount,
    payment_method: "card", // Payment links default to card
    stripe_payment_id: paymentLink.id,
    stripe_payment_link_id: paymentLink.id,
    status: "succeeded",
    payer_email: paymentLink.customer_details?.email || invoice.homeowner_email,
    payer_name: paymentLink.customer_details?.name || invoice.homeowner_name,
  });

  if (paymentError) {
    console.error("Error creating payment record:", paymentError);
  }

  // Update invoice status (trigger will handle amount_paid update)
  const newAmountPaid = (invoice.amount_paid || 0) + amount;
  const newStatus =
    newAmountPaid >= invoice.amount_due
      ? "paid"
      : newAmountPaid > 0
      ? "partial"
      : invoice.status;

  await supabase
    .from("invoices")
    .update({
      amount_paid: newAmountPaid,
      status: newStatus,
    })
    .eq("id", invoiceId);

  // Update job payment status if job_id exists
  if (invoice.job_id) {
    const { data: job } = await supabase
      .from("roofing_jobs")
      .select("total_paid, deposit_collected, deposit_amount")
      .eq("id", invoice.job_id)
      .single();

    if (job) {
      const newTotalPaid = (job.total_paid || 0) + amount;
      const isDeposit = invoice.invoice_type === "deposit";
      const depositCollected =
        isDeposit && amount >= (job.deposit_amount || 0);

      let paymentStatus = "unpaid";
      if (newTotalPaid >= invoice.amount_due) {
        paymentStatus = "paid";
      } else if (depositCollected) {
        paymentStatus = "deposit_paid";
      } else if (newTotalPaid > 0) {
        paymentStatus = "partial";
      }

      await supabase
        .from("roofing_jobs")
        .update({
          total_paid: newTotalPaid,
          deposit_collected: depositCollected || job.deposit_collected,
          payment_status: paymentStatus,
        })
        .eq("id", invoice.job_id);
    }
  }
}

async function handleCheckoutSessionCompleted(session: any) {
  const invoiceId = session.metadata?.invoice_id;
  if (!invoiceId) return;

  // Similar handling to payment link success
  await handlePaymentLinkSuccess({
    id: session.id,
    amount_total: session.amount_total,
    metadata: session.metadata,
    customer_details: session.customer_details,
  });
}

async function handlePaymentIntentSucceeded(paymentIntent: any) {
  const invoiceId = paymentIntent.metadata?.invoice_id;
  if (!invoiceId) return;

  const amount = paymentIntent.amount / 100;

  // Get invoice
  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();

  if (!invoice) return;

  // Create or update payment record
  await supabase.from("payments").upsert(
    {
      org_id: invoice.org_id,
      invoice_id: invoiceId,
      job_id: invoice.job_id,
      amount,
      payment_method: paymentIntent.payment_method_types?.[0] || "card",
      stripe_payment_id: paymentIntent.id,
      status: "succeeded",
      payer_email: paymentIntent.receipt_email || invoice.homeowner_email,
    },
    {
      onConflict: "stripe_payment_id",
    }
  );

  // Update invoice (trigger handles amount_paid)
  const newAmountPaid = (invoice.amount_paid || 0) + amount;
  const newStatus =
    newAmountPaid >= invoice.amount_due
      ? "paid"
      : newAmountPaid > 0
      ? "partial"
      : invoice.status;

  await supabase
    .from("invoices")
    .update({
      amount_paid: newAmountPaid,
      status: newStatus,
    })
    .eq("id", invoiceId);
}

async function handlePaymentIntentFailed(paymentIntent: any) {
  const invoiceId = paymentIntent.metadata?.invoice_id;
  if (!invoiceId) return;

  // Record failed payment attempt
  await supabase.from("payments").insert({
    org_id: paymentIntent.metadata?.org_id,
    invoice_id: invoiceId,
    amount: paymentIntent.amount / 100,
    payment_method: paymentIntent.payment_method_types?.[0] || "card",
    stripe_payment_id: paymentIntent.id,
    status: "failed",
  });
}



























