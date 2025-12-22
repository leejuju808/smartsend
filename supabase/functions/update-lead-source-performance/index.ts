// supabase/functions/update-lead-source-performance/index.ts
// Block 22052 — SmartSend Roofing Lead Source Performance Brain v1
// Edge Function: Updates lead source performance metrics
// Triggered whenever:
// - a lead is created
// - a lead changes status
// - risk changes
// - job health changes
// - revenue changes

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const workspace_id = body.workspace_id || null;

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "Missing workspace_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get aggregated data from lead_source_view
    const { data: rows, error: viewError } = await supabase
      .from("lead_source_view")
      .select("*")
      .eq("workspace_id", workspace_id);

    if (viewError) {
      console.error("Error fetching lead_source_view:", viewError);
      return new Response(
        JSON.stringify({ error: viewError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!rows || rows.length === 0) {
      return new Response(
        JSON.stringify({ message: "No lead sources found", updated: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const results = [];

    // Process each lead source
    for (const row of rows) {
      // Calculate lead quality score using database function
      const { data: qualityScore, error: scoreError } = await supabase.rpc(
        "calculate_lead_quality_score",
        {
          p_close_rate: row.close_rate || 0,
          p_avg_health: row.avg_health || 50,
          p_avg_experience: row.avg_experience || 50,
          p_avg_momentum: row.avg_momentum || 50,
        }
      );

      const lead_quality_score = scoreError ? 50 : (qualityScore as number);

      // Upsert performance data
      const { error: upsertError } = await supabase
        .from("lead_source_performance")
        .upsert(
          {
            workspace_id: row.workspace_id,
            lead_source: row.lead_source,
            total_leads: row.total_leads || 0,
            active_leads: row.active_leads || 0,
            wins: row.wins || 0,
            losses: row.losses || 0,
            close_rate: row.close_rate || 0,
            avg_job_size: row.avg_job_size || null,
            total_revenue: row.total_revenue || 0,
            avg_health: row.avg_health || null,
            avg_momentum: row.avg_momentum || null,
            avg_experience: row.avg_experience || null,
            risk_low: row.risk_low || 0,
            risk_med: row.risk_med || 0,
            risk_high: row.risk_high || 0,
            risk_critical: row.risk_critical || 0,
            lead_quality_score: lead_quality_score,
            revenue_per_lead: row.revenue_per_lead || 0,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "workspace_id,lead_source",
          }
        );

      if (upsertError) {
        console.error(`Error upserting performance for ${row.lead_source}:`, upsertError);
        continue;
      }

      results.push({
        lead_source: row.lead_source,
        total_leads: row.total_leads,
        quality_score: lead_quality_score,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Lead sources updated",
        updated: results.length,
        results,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("update-lead-source-performance error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Internal server error" 
      }),
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









































