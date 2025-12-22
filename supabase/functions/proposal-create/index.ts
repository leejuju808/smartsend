// Block 57000 — SmartSend Roofing "Sales Proposal Builder + Digital Signing System" v1
// Edge Function: /proposal/create
// Creates a draft proposal

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
      job_id,
      homeowner_id,
      contractor_id,
      workspace_id,
      template_id,
      proposal_data = {},
    } = await req.json();

    if (!workspace_id || !contractor_id) {
      return new Response(
        JSON.stringify({ error: "workspace_id and contractor_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate public token for homeowner access
    const { data: tokenData } = await supabase.rpc("generate_proposal_token");
    const public_token = tokenData || crypto.randomUUID();

    // Create proposal
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .insert({
        job_id: job_id || null,
        homeowner_id: homeowner_id || null,
        contractor_id,
        workspace_id,
        template_id: template_id || null,
        status: "draft",
        proposal_data,
        public_token,
        version_number: 1,
      })
      .select()
      .single();

    if (proposalError) {
      console.error("Error creating proposal:", proposalError);
      return new Response(
        JSON.stringify({ error: "Failed to create proposal", details: proposalError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ proposal }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in proposal-create:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
































