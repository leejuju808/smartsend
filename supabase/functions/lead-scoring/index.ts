// Block 432 — Lead Scoring v1
// Edge Function: Score Calculator
// Computes lead score (0-100) based on enrichment, engagement, and quality factors

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  try {
    const { lead_id } = await req.json();

    if (!lead_id) {
      return new Response(
        JSON.stringify({ error: "Missing lead_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Call the database function to compute the score
    const { data, error } = await supabase.rpc("compute_lead_score", {
      p_lead_id: lead_id,
    });

    if (error) {
      console.error("Error computing lead score:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, ...data }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in lead-scoring:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});



