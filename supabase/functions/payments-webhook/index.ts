// Block 22880 — SmartSend Roofing Payments & Collections v1
// Edge Function: /payments/webhook
// 
// Stripe webhook listener — fires when payment is completed
// This:
// - Marks invoice as "Paid"
// - Inserts record in job_payments
// - Updates profit snapshot (via trigger)
// - Updates timeline
// This is the core payment confirmation engine

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;
const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2022-11-15",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response(
        JSON.stringify({ error: "Missing stripe-signature header" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body = await req.text();

    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        stripeWebhookSecret
      );
    } catch (err: any) {
      console.error("Webhook signature verification failed:", err.message);
      return new Response(
        JSON.stringify({ error: `Webhook signature verification failed: ${err.message}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Handle payment_intent.succeeded event
    if (event.type === "checkout.session.completed" || event.type === "payment_intent.succeeded") {
      let paymentIntent: Stripe.PaymentIntent | null = null;
      let session: Stripe.Checkout.Session | null = null;
      let metadata: Record<string, string> = {};

      if (event.type === "checkout.session.completed") {
        session = event.data.object as Stripe.Checkout.Session;
        metadata = session.metadata || {};
        
        // Get payment intent from session
        if (session.payment_intent) {
          paymentIntent = await stripe.paymentIntents.retrieve(
            typeof session.payment_intent === 'string' 
              ? session.payment_intent 
              : session.payment_intent.id
          );
        }
      } else {
        paymentIntent = event.data.object as Stripe.PaymentIntent;
        metadata = paymentIntent.metadata || {};
      }

      if (!paymentIntent) {
        console.log("No payment intent found, skipping");
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const orgId = metadata.org_id;
      const jobId = metadata.job_id;
      const invoiceType = metadata.invoice_type;

      if (!orgId || !jobId) {
        console.log("Missing org_id or job_id in metadata, skipping");
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find invoice by payment link or stripe_invoice_id
      const { data: invoices, error: invoiceError } = await supabase
        .from("job_invoices")
        .select("*")
        .eq("org_id", orgId)
        .eq("job_id", jobId)
        .eq("type", invoiceType || "final")
        .order("created_at", { ascending: false })
        .limit(1);

      if (invoiceError || !invoices || invoices.length === 0) {
        console.error("Could not find invoice:", invoiceError);
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const invoice = invoices[0];

      // Check if payment already recorded
      const { data: existingPayment } = await supabase
        .from("job_payments")
        .select("id")
        .eq("stripe_payment_id", paymentIntent.id)
        .single();

      if (existingPayment) {
        console.log("Payment already recorded, skipping");
        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Determine payment method
      let paymentMethod = "card";
      if (paymentIntent.payment_method) {
        const pm = await stripe.paymentMethods.retrieve(
          typeof paymentIntent.payment_method === 'string'
            ? paymentIntent.payment_method
            : paymentIntent.payment_method.id
        );
        if (pm.type === "us_bank_account") {
          paymentMethod = "ach";
        }
      }

      // Insert payment record
      const amount = paymentIntent.amount / 100; // Convert from cents
      const { data: payment, error: paymentError } = await supabase
        .from("job_payments")
        .insert({
          org_id: orgId,
          job_id: jobId,
          invoice_id: invoice.id,
          amount,
          method: paymentMethod,
          stripe_payment_id: paymentIntent.id,
          payer_name: paymentIntent.shipping?.name || session?.customer_details?.name || null,
          payer_email: paymentIntent.receipt_email || session?.customer_details?.email || null,
        })
        .select()
        .single();

      if (paymentError) {
        console.error("Error recording payment:", paymentError);
        throw paymentError;
      }

      // Update invoice status (trigger should handle this, but ensure it's done)
      await supabase
        .from("job_invoices")
        .update({ status: "paid", updated_at: new Date().toISOString() })
        .eq("id", invoice.id);

      // Add timeline event
      try {
        await supabase.from("job_events").insert({
          org_id: orgId,
          job_id: jobId,
          event_type: "payment_received",
          metadata: {
            payment_id: payment.id,
            invoice_id: invoice.id,
            amount,
            method: paymentMethod,
          },
        });
      } catch (err) {
        // job_events table might not exist, that's okay
        console.log("Could not add timeline event:", err);
      }

      console.log(`Payment recorded: ${payment.id} for job ${jobId}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error in payments-webhook:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

