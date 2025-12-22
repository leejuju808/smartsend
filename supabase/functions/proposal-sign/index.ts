// Block 57000 — SmartSend Roofing "Sales Proposal Builder + Digital Signing System" v1
// Edge Function: /proposal/sign
// Stores signature + timestamp + final price

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
      proposal_id,
      signature,
      final_price,
      homeowner_name,
      ip_address,
    } = await req.json();

    if (!proposal_id || !signature) {
      return new Response(
        JSON.stringify({ error: "proposal_id and signature are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build signature object
    const signatureData = {
      type: signature.type || "typed", // 'typed', 'drawn', 'touch'
      data: signature.data || signature.signature,
      name: homeowner_name || signature.name || "Homeowner",
      timestamp: new Date().toISOString(),
      ip_address: ip_address || null,
    };

    // Update proposal with signature
    const { data: proposal, error: updateError } = await supabase
      .from("proposals")
      .update({
        signature: signatureData,
        signed_at: new Date().toISOString(),
        status: "signed",
        total_price: final_price || null,
      })
      .eq("id", proposal_id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating proposal:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to sign proposal", details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // TODO: Send notification to contractor
    // TODO: Create job from signed proposal if applicable

    return new Response(
      JSON.stringify({ 
        proposal,
        signed: true,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in proposal-sign:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
































