// Block 27280 — SmartSend Roofing Deposit & Payment Request Engine v1
// Edge Function: /create_deposit_request
// 
// Creates a Stripe Checkout Session + SmartSend payment request entry
// This is the core deposit request creation engine that ties SmartSend to Stripe

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")!;
const publicAppUrl = Deno.env.get("PUBLIC_APP_URL") || "http://localhost:3000";

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2024-06-20",
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
    const { job_id, deposit_percentage } = await req.json();

    if (!job_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: job_id" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 1. Load job + customer info
    // Try to get job from roofing_jobs table with customer info from leads/contacts
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select(`
        id,
        workspace_id,
        title,
        homeowner_name,
        job_value,
        projected_job_value,
        lead_id,
        contact_id
      `)
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get customer email from lead or contact
    let customerEmail: string | null = null;
    let customerName: string | null = job.homeowner_name || null;

    if (job.lead_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select("email, first_name, last_name")
        .eq("id", job.lead_id)
        .single();
      
      if (lead) {
        customerEmail = lead.email || null;
        if (!customerName && (lead.first_name || lead.last_name)) {
          customerName = `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || null;
        }
      }
    }

    if (!customerEmail && job.contact_id) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("email, name")
        .eq("id", job.contact_id)
        .single();
      
      if (contact) {
        customerEmail = contact.email || null;
        if (!customerName && contact.name) {
          customerName = contact.name;
        }
      }
    }

    // Calculate deposit amount
    const contractAmount = Number(job.job_value || job.projected_job_value || 0);
    const percent = deposit_percentage || 0.4; // default 40%
    const depositAmount = Math.round(contractAmount * percent * 100) / 100; // Round to 2 decimals

    if (depositAmount <= 0) {
      return new Response(
        JSON.stringify({ error: "Invalid deposit amount. Job value must be greater than 0." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 2. Create Stripe Checkout Session
    const jobName = job.title || customerName || "Roofing Job";
    const successUrl = `${publicAppUrl}/jobs/${job_id}?payment=success`;
    const cancelUrl = `${publicAppUrl}/jobs/${job_id}?payment=cancel`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: customerEmail || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(depositAmount * 100), // cents
            product_data: {
              name: `Deposit for ${jobName}`,
              description: `Deposit payment for roofing job`,
            },
          },
        },
      ],
      metadata: {
        job_id: job.id,
        type: "deposit",
        workspace_id: job.workspace_id,
      },
    });

    // 3. Insert payment_request record
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7); // deposit due in 7 days by default

    const { data: pr, error: prError } = await supabase
      .from("roofing_payment_requests")
      .insert({
        job_id: job.id,
        workspace_id: job.workspace_id,
        request_type: "deposit",
        amount: depositAmount,
        currency: "usd",
        status: "sent",
        due_date: dueDate.toISOString().slice(0, 10),
        sent_at: new Date().toISOString(),
        payment_link_url: session.url,
        processor_session_id: session.id,
        customer_email: customerEmail,
        customer_name: customerName,
      })
      .select("*")
      .single();

    if (prError) {
      console.error("Error creating payment request:", prError);
      return new Response(
        JSON.stringify({ error: prError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        payment_request_id: pr.id,
        payment_link_url: session.url,
        amount: depositAmount,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("Error in create_deposit_request:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});



































