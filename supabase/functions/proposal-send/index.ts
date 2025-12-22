// Block 57000 — SmartSend Roofing "Sales Proposal Builder + Digital Signing System" v1
// Edge Function: /proposal/send
// Sends proposal link to homeowner + marks status = "sent"

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const siteUrl = Deno.env.get("NEXT_PUBLIC_SITE_URL") || "https://app.smartsend.ai";

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
    const {
      proposal_id,
      homeowner_email,
      send_email = true,
    } = await req.json();

    if (!proposal_id) {
      return new Response(
        JSON.stringify({ error: "proposal_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get proposal
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .select(`
        *,
        homeowner:homeowners(*),
        contractor:profiles!proposals_contractor_id_fkey(*)
      `)
      .eq("id", proposal_id)
      .single();

    if (proposalError || !proposal) {
      return new Response(
        JSON.stringify({ error: "Proposal not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update proposal status
    const { data: updatedProposal, error: updateError } = await supabase
      .from("proposals")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .eq("id", proposal_id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating proposal:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update proposal", details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate proposal link
    const proposal_link = `${siteUrl}/proposal/${proposal.public_token}`;

    // Send email if requested
    if (send_email && homeowner_email) {
      // TODO: Integrate with email sending system
      // For now, just log the email that would be sent
      console.log("Would send proposal email to:", homeowner_email);
      console.log("Proposal link:", proposal_link);
    }

    return new Response(
      JSON.stringify({ 
        proposal: updatedProposal,
        proposal_link,
        sent: true,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in proposal-send:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
































