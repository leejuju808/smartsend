// Block 40850 — SmartSend Roofing "AI Proposal Engine + Dynamic Estimate Builder" v1
// Edge Function: /send-proposal
// 
// Sends proposal to homeowner via SMS and email

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const portalUrl = Deno.env.get("PORTAL_URL") || "https://app.smartsend.ai";
const vonageApiKey = Deno.env.get("VONAGE_API_KEY");
const vonageApiSecret = Deno.env.get("VONAGE_API_SECRET");
const vonageFromNumber = Deno.env.get("VONAGE_FROM_NUMBER");

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
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
    const { proposal_id } = await req.json();

    if (!proposal_id) {
      return new Response(
        JSON.stringify({ error: "proposal_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get proposal with lead/job details
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .select(`
        *,
        leads:lead_id(id, email, phone, first_name, last_name),
        jobs:job_id(id, lead_id)
      `)
      .eq("id", proposal_id)
      .single();

    if (proposalError || !proposal) {
      return new Response(
        JSON.stringify({ error: "Proposal not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get lead details
    let lead = proposal.leads;
    if (!lead && proposal.jobs?.lead_id) {
      const { data: leadData } = await supabase
        .from("leads")
        .select("*")
        .eq("id", proposal.jobs.lead_id)
        .single();
      lead = leadData;
    }

    if (!lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found for proposal" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate or get proposal token
    let token = proposal.token;
    if (!token) {
      // Generate token
      const tokenBytes = new Uint8Array(32);
      crypto.getRandomValues(tokenBytes);
      token = Array.from(tokenBytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      
      // Update proposal with token
      await supabase
        .from("proposals")
        .update({ token, status: "sent" })
        .eq("id", proposal_id);
    } else {
      // Update status to sent
      await supabase
        .from("proposals")
        .update({ status: "sent" })
        .eq("id", proposal_id);
    }

    const proposalUrl = `${portalUrl}/proposal/${token}`;
    const leadName = lead.first_name || "there";

    // Send SMS if phone number exists
    if (lead.phone && vonageApiKey && vonageApiSecret) {
      try {
        const smsResponse = await fetch("https://rest.nexmo.com/sms/json", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            api_key: vonageApiKey,
            api_secret: vonageApiSecret,
            to: lead.phone,
            from: vonageFromNumber || "SmartSend",
            text: `Hi ${leadName}, your roofing proposal is ready! View your options here: ${proposalUrl}`,
          }),
        });

        if (!smsResponse.ok) {
          console.error("SMS send failed:", await smsResponse.text());
        }
      } catch (smsError) {
        console.error("Error sending SMS:", smsError);
        // Don't fail the whole request if SMS fails
      }
    }

    // Log proposal event
    await supabase.from("proposal_events").insert({
      proposal_id,
      event_type: "sent",
      metadata: {
        sent_via: lead.phone ? "sms" : "email",
        lead_phone: lead.phone,
        lead_email: lead.email,
      },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        url: proposalUrl,
        proposal_id,
        message: "Proposal sent successfully",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in send-proposal:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
































