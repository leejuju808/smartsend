// Block 22880 — SmartSend Roofing Payments & Collections v1
// Edge Function: /payments/create-invoice
// 
// Creates a Stripe payment link + SmartSend invoice entry
// This is the core invoice creation engine that ties SmartSend to Stripe

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2022-11-15",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { org_id, job_id, amount, invoice_type, home_email } = await req.json();

    if (!org_id || !job_id || !amount) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: org_id, job_id, amount" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate invoice_type
    const validTypes = ['deposit', 'progress', 'final'];
    const invoiceType = invoice_type || 'final';
    if (!validTypes.includes(invoiceType)) {
      return new Response(
        JSON.stringify({ error: `Invalid invoice_type. Must be one of: ${validTypes.join(', ')}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 1️⃣ Create Stripe Payment Link
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { 
              name: `Job Payment — ${invoiceType}`,
              description: `Payment for roofing job invoice`,
            },
            unit_amount: Math.round(Number(amount) * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      metadata: {
        org_id,
        job_id,
        invoice_type: invoiceType,
      },
    });

    // 2️⃣ Insert invoice record
    const { data: invoice, error: invoiceError } = await supabase
      .from("job_invoices")
      .insert({
        org_id,
        job_id,
        type: invoiceType,
        amount: Number(amount),
        status: "sent",
        payment_link: paymentLink.url,
        stripe_invoice_id: paymentLink.id,
      })
      .select()
      .single();

    if (invoiceError) {
      console.error("Error creating invoice:", invoiceError);
      throw invoiceError;
    }

    // 3️⃣ Add timeline event (if job_events table exists)
    try {
      await supabase.from("job_events").insert({
        org_id,
        job_id,
        event_type: "invoice_sent",
        metadata: {
          invoice_id: invoice.id,
          invoice_type: invoiceType,
          amount: Number(amount),
          payment_link: paymentLink.url,
        },
      });
    } catch (err) {
      // job_events table might not exist, that's okay
      console.log("Could not add timeline event:", err);
    }

    return new Response(
      JSON.stringify({ ok: true, invoice }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("Error in payments-create-invoice:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

