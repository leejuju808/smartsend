// supabase/functions/calculate-source-performance/index.ts
// Block 21966 — SmartSend Roofing Lead Source Intelligence v1
// Nightly calculation of lead source performance metrics

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

    // If workspace_id provided, calculate for that workspace only
    // Otherwise, calculate for all workspaces
    let workspaces: { id: string }[] = [];

    if (workspace_id) {
      const { data: workspace, error } = await supabase
        .from("workspaces")
        .select("id")
        .eq("id", workspace_id)
        .single();

      if (error || !workspace) {
        return new Response(
          JSON.stringify({ error: "Workspace not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      workspaces = [workspace];
    } else {
      // Get all workspaces
      const { data: allWorkspaces, error } = await supabase
        .from("workspaces")
        .select("id");

      if (error) {
        throw new Error(`Failed to fetch workspaces: ${error.message}`);
      }

      workspaces = allWorkspaces || [];
    }

    const results = [];

    for (const workspace of workspaces) {
      const wsId = workspace.id;

      // Get all unique lead sources for this workspace
      const { data: sources, error: sourcesError } = await supabase
        .from("leads")
        .select("lead_source")
        .eq("workspace_id", wsId)
        .not("lead_source", "is", null)
        .neq("lead_source", "unknown");

      if (sourcesError) {
        console.error(`Error fetching sources for workspace ${wsId}:`, sourcesError);
        continue;
      }

      // Get unique sources
      const uniqueSources = [...new Set((sources || []).map((s) => s.lead_source))];

      for (const source of uniqueSources) {
        // Calculate metrics for this source
        const { data: leads, error: leadsError } = await supabase
          .from("leads")
          .select(
            `
            id,
            heat_score,
            job_probability,
            status,
            job_value,
            estimated_job_value
            `
          )
          .eq("workspace_id", wsId)
          .eq("lead_source", source);

        if (leadsError || !leads || leads.length === 0) {
          continue;
        }

        const totalLeads = leads.length;

        // Calculate average heat score
        const heatScores = leads
          .map((l) => l.heat_score)
          .filter((s): s is number => s !== null && s !== undefined);
        const avgHeat = heatScores.length > 0
          ? Math.round(heatScores.reduce((a, b) => a + b, 0) / heatScores.length)
          : null;

        // Calculate average probability
        const probabilities = leads
          .map((l) => l.job_probability)
          .filter((p): p is number => p !== null && p !== undefined);
        const avgProbability = probabilities.length > 0
          ? Math.round(probabilities.reduce((a, b) => a + b, 0) / probabilities.length)
          : null;

        // Calculate close rate (won / total)
        const wonLeads = leads.filter((l) => l.status === "won").length;
        const closeRate = totalLeads > 0 ? (wonLeads / totalLeads) * 100 : 0;

        // Calculate average job value (use job_value if available, otherwise estimated_job_value)
        const jobValues = leads
          .map((l) => l.job_value ?? l.estimated_job_value)
          .filter((v): v is number => v !== null && v !== undefined && v > 0);
        const avgJobValue = jobValues.length > 0
          ? jobValues.reduce((a, b) => a + b, 0) / jobValues.length
          : null;

        // Calculate total revenue (sum of won job values, prefer job_value over estimated_job_value)
        const totalRevenue = leads
          .filter((l) => l.status === "won")
          .map((l) => l.job_value ?? l.estimated_job_value ?? 0)
          .reduce((a, b) => a + b, 0);

        // Calculate source score using database function
        const { data: scoreResult, error: scoreError } = await supabase.rpc(
          "calculate_source_score",
          {
            p_avg_heat: avgHeat,
            p_avg_probability: avgProbability,
            p_close_rate: closeRate,
            p_avg_job_value: avgJobValue || 0,
            p_total_leads: totalLeads,
            p_efficiency_score: 50, // Default efficiency score (can be enhanced later)
          }
        );

        const sourceScore = scoreError ? null : (scoreResult as number);

        // Upsert stats
        const { error: upsertError } = await supabase
          .from("lead_source_stats")
          .upsert(
            {
              workspace_id: wsId,
              source,
              total_leads: totalLeads,
              avg_heat: avgHeat,
              avg_probability: avgProbability,
              close_rate: Math.round(closeRate * 100) / 100, // Round to 2 decimals
              avg_job_value: avgJobValue ? Math.round(avgJobValue * 100) / 100 : null,
              total_revenue: totalRevenue > 0 ? Math.round(totalRevenue * 100) / 100 : null,
              source_score: sourceScore,
            },
            {
              onConflict: "workspace_id,source",
            }
          );

        if (upsertError) {
          console.error(`Error upserting stats for ${source} in workspace ${wsId}:`, upsertError);
        } else {
          results.push({
            workspace_id: wsId,
            source,
            total_leads: totalLeads,
            source_score: sourceScore,
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
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
    console.error("calculate-source-performance error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
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

