// Block 432 — Lead Scoring v1
// Edge Function: Daily Cron to Recompute All Scores
// Runs daily to recompute scores for all leads

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  try {
    // Get all leads (in batches)
    const batchSize = 1000;
    let totalProcessed = 0;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: leads, error: leadsError } = await supabase
        .from("leads")
        .select("id")
        .range(offset, offset + batchSize - 1)
        .order("created_at", { ascending: false });

      if (leadsError) {
        throw leadsError;
      }

      if (!leads || leads.length === 0) {
        hasMore = false;
        break;
      }

      // Process each lead
      for (const lead of leads) {
        try {
          // Call the scoring function for each lead
          const { error: scoreError } = await supabase.rpc("compute_lead_score", {
            p_lead_id: lead.id,
          });

          if (scoreError) {
            console.error(`Error scoring lead ${lead.id}:`, scoreError);
          } else {
            totalProcessed++;
          }
        } catch (err) {
          console.error(`Exception scoring lead ${lead.id}:`, err);
        }
      }

      offset += batchSize;
      hasMore = leads.length === batchSize;
    }

    // Get stats
    const { data: stats } = await supabase
      .from("lead_scores")
      .select("score")
      .not("score", "is", null);

    const totalScored = stats?.length || 0;
    const avgScore =
      totalScored > 0
        ? Math.round(
            stats.reduce((sum, s) => sum + (s.score || 0), 0) / totalScored
          )
        : 0;
    const highQualityLeads = stats?.filter((s) => (s.score || 0) >= 60).length || 0;

    return new Response(
      JSON.stringify({
        ok: true,
        processed: totalProcessed,
        stats: {
          totalScored,
          averageScore: avgScore,
          highQualityLeads,
          timestamp: new Date().toISOString(),
        },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in lead-scoring-cron:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});



