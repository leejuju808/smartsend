// Block 21730 — SmartSend Roofing Lead Heat Score v1
// Cron Edge Function — Recalculate Heat Scores for Active Leads
// Run every 15 min or 30 min

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.6";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Only recalc for live-ish leads (last 30 days)
    const { data: leads, error } = await supabase
      .from("leads")
      .select("id")
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

    if (error) {
      console.error("Error fetching leads:", error);
      return new Response(JSON.stringify({ error: error.message }), { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ message: "No leads to process", processed: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Process each lead
    let processed = 0;
    let errors = 0;

    for (const lead of leads) {
      const { error: updateError } = await supabase.rpc("update_lead_heat_score", {
        p_lead_id: lead.id,
      });

      if (updateError) {
        console.error(`Error updating heat score for lead ${lead.id}:`, updateError);
        errors++;
      } else {
        processed++;
      }
    }

    return new Response(
      JSON.stringify({
        message: "Heat scores recalculated",
        processed,
        errors,
        total: leads.length,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});










































