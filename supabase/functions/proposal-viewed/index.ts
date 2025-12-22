// Block 32711 — SmartSend Roofing "AI Proposal Builder + Dynamic Contract Generator" v1
// Edge Function: /proposal-viewed
// 
// Tracks proposal engagement events

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
    const { proposal_id, event_type, section, metadata } = await req.json();

    if (!proposal_id || !event_type) {
      return new Response(
        JSON.stringify({ error: "proposal_id and event_type are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update proposal status if it's the first view
    if (event_type === "opened") {
      const { data: proposal } = await supabase
        .from("proposals")
        .select("viewed_at, status")
        .eq("id", proposal_id)
        .single();

      if (proposal && !proposal.viewed_at) {
        await supabase
          .from("proposals")
          .update({ 
            status: "viewed",
            viewed_at: new Date().toISOString()
          })
          .eq("id", proposal_id);
      } else if (proposal && proposal.status === "draft") {
        await supabase
          .from("proposals")
          .update({ status: "viewed" })
          .eq("id", proposal_id);
      }
    }

    // Insert engagement event
    const engagementData: any = {
      proposal_id,
      event_type,
      metadata: metadata || {},
    };

    if (section) {
      engagementData.metadata = { ...engagementData.metadata, section };
    }

    const { error: engagementError } = await supabase
      .from("proposal_engagement")
      .insert(engagementData);

    if (engagementError) {
      console.error("Error inserting engagement:", engagementError);
      return new Response(
        JSON.stringify({ error: "Failed to track engagement" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  } catch (error: any) {
    console.error("Error in proposal-viewed:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

































