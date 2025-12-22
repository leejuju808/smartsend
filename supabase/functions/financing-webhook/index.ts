// Block 33155 — SmartSend Roofing "Smart Financing Engine + Homeowner Offer Flow" v1
// Edge Function: financing-webhook
// Handles webhooks from financing providers to update application status

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  try {
    const event = await req.json();

    // Extract required fields from webhook event
    const {
      application_id, // Our internal financing_applications.id
      provider_application_id, // External provider's application ID
      status,
      approved_amount,
      monthly_payment_estimate,
      term_months,
      apr,
      decision_data, // Full provider response
    } = event;

    if (!application_id || !status) {
      return new Response(
        JSON.stringify({ error: "application_id and status are required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Validate status
    const validStatuses = [
      "started",
      "submitted",
      "approved",
      "preapproved",
      "declined",
      "needs_docs",
      "expired",
      "cancelled",
    ];
    if (!validStatuses.includes(status)) {
      return new Response(
        JSON.stringify({ error: "Invalid status" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Get existing application
    const { data: app, error: appError } = await supabase
      .from("financing_applications")
      .select("*")
      .eq("id", application_id)
      .single();

    if (appError || !app) {
      return new Response(
        JSON.stringify({ error: "Application not found" }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Prepare update data
    const updateData: any = {
      status,
      decision: decision_data || event, // Store full provider response
      updated_at: new Date().toISOString(),
    };

    // Add provider application ID if provided
    if (provider_application_id) {
      updateData.provider_application_id = provider_application_id;
    }

    // Add payment estimates if approved/preapproved
    if (status === "approved" || status === "preapproved") {
      if (approved_amount) {
        updateData.amount_requested = approved_amount;
      }
      if (monthly_payment_estimate) {
        updateData.monthly_payment_estimate = monthly_payment_estimate;
      }
      if (term_months) {
        updateData.term_months = term_months;
      }
      if (apr) {
        updateData.apr = apr;
      }
      updateData.approved_at = new Date().toISOString();
    } else if (status === "declined") {
      updateData.declined_at = new Date().toISOString();
    } else if (status === "submitted") {
      updateData.submitted_at = new Date().toISOString();
    }

    // Update application
    const { error: updateError } = await supabase
      .from("financing_applications")
      .update(updateData)
      .eq("id", application_id);

    if (updateError) {
      console.error("Error updating financing application:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update application" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // If financing approved → auto-progress job (handled by trigger, but we can also do it here for immediate effect)
    if ((status === "approved" || status === "preapproved") && app.job_id) {
      // The database trigger will handle this, but we can also do it here for immediate effect
      await supabase
        .from("jobs")
        .update({
          stage: "approved",
          updated_at: new Date().toISOString(),
        })
        .eq("id", app.job_id)
        .eq("stage", "estimate"); // Only update if still in estimate stage
    }

    return new Response(
      JSON.stringify({ ok: true, application_id }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    console.error("Error processing financing webhook:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});

































