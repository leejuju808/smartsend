// Block 21856 — SmartSend Roofing Revenue Forecast Engine v1
// Edge function to compute revenue forecasts for a workspace
// Runs daily at midnight OR on-demand

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ForecastInput {
  workspace_id: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse input
    let workspace_id: string | null = null;

    if (req.method === "POST") {
      const body: ForecastInput = await req.json();
      workspace_id = body.workspace_id || null;
    } else if (req.method === "GET") {
      const url = new URL(req.url);
      workspace_id = url.searchParams.get("workspace_id");
    }

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: workspace_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Revenue Forecast] Computing for workspace ${workspace_id}`);

    // ============================================================================
    // 1. FETCH ACTIVE PIPELINE LEADS
    // ============================================================================
    // Get leads with proposals or estimated job values
    // Statuses that indicate active pipeline: estimate_completed, contract_sent, proposal_sent, decision_pending
    // Also check pipeline_stage for roofing-specific stages

    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select(`
        id,
        workspace_id,
        estimator_id,
        estimated_job_value,
        estimated_value,
        job_probability,
        pipeline_stage,
        status,
        outcome
      `)
      .eq("workspace_id", workspace_id)
      .or("estimated_job_value.not.is.null,estimated_value.not.is.null")
      .not("outcome", "eq", "lost")
      .not("outcome", "eq", "won");

    if (leadsError) {
      console.error("Error fetching leads:", leadsError);
      throw leadsError;
    }

    // Also fetch proposals to get proposal amounts
    const { data: proposals, error: proposalsError } = await supabase
      .from("proposals")
      .select(`
        id,
        contact_id,
        lead_id,
        workspace_id,
        status,
        proposal_data
      `)
      .eq("workspace_id", workspace_id)
      .in("status", ["sent", "approved", "generated"]);

    if (proposalsError) {
      console.error("Error fetching proposals:", proposalsError);
      // Continue without proposals if error
    }

    // Create a map of lead_id -> proposal_amount from proposals
    const proposalMap = new Map<string, number>();
    (proposals || []).forEach((p) => {
      if (p.lead_id) {
        const proposalData = p.proposal_data as any;
        const projectPrice = proposalData?.project_price || 0;
        if (projectPrice > 0) {
          proposalMap.set(p.lead_id, projectPrice);
        }
      }
    });

    // ============================================================================
    // 2. CALCULATE FORECAST METRICS
    // ============================================================================

    let weighted = 0;
    let bestCase = 0;
    let worstCase = 0;
    let leakage = 0;

    const estimatorMap: Record<string, {
      total: number;
      weighted: number;
      bestCase: number;
    }> = {};

    // Process each lead
    (leads || []).forEach((lead) => {
      // Get job value: proposal_amount OR estimated_job_value OR estimated_value
      const proposalAmount = proposalMap.get(lead.id) || 0;
      const estimatedValue = parseFloat(
        String(lead.estimated_job_value || lead.estimated_value || 0)
      );
      const value = proposalAmount > 0 ? proposalAmount : estimatedValue;

      if (value <= 0) return; // Skip leads without value

      // Get job probability (0-100)
      const probability = lead.job_probability || 0;

      // Weighted revenue: Job Value × Job Probability %
      const weightedValue = value * (probability / 100);
      weighted += weightedValue;

      // Best case: sum of all job values
      bestCase += value;

      // Worst case: only jobs with probability ≥ 70%
      if (probability >= 70) {
        worstCase += value;
      }

      // Estimator breakdown
      const estimatorId = lead.estimator_id || "unassigned";
      if (!estimatorMap[estimatorId]) {
        estimatorMap[estimatorId] = {
          total: 0,
          weighted: 0,
          bestCase: 0,
        };
      }
      estimatorMap[estimatorId].total += value;
      estimatorMap[estimatorId].weighted += weightedValue;
      estimatorMap[estimatorId].bestCase += value;
    });

    // ============================================================================
    // 3. CALCULATE HISTORICAL FORECAST
    // ============================================================================
    // Use estimator's past win rate: estimator_win_rate * total proposed job value

    const { data: estimators, error: estimatorsError } = await supabase
      .from("estimator_scorecards")
      .select("estimator_id, win_rate")
      .eq("workspace_id", workspace_id)
      .not("win_rate", "is", null)
      .order("period_end", { ascending: false })
      .limit(100); // Get recent scorecards

    if (estimatorsError) {
      console.error("Error fetching estimator scorecards:", estimatorsError);
    }

    // Create win rate map (use most recent win rate per estimator)
    const winRateMap = new Map<string, number>();
    (estimators || []).forEach((e) => {
      if (e.win_rate && !winRateMap.has(e.estimator_id)) {
        winRateMap.set(e.estimator_id, e.win_rate);
      }
    });

    // Calculate historical forecast
    let historical = 0;
    Object.entries(estimatorMap).forEach(([estimatorId, data]) => {
      const winRate = winRateMap.get(estimatorId) || 0;
      historical += data.total * (winRate / 100);
    });

    // ============================================================================
    // 4. CALCULATE REVENUE LEAKAGE
    // ============================================================================
    // Jobs lost due to:
    // - missed follow-ups
    // - slow response
    // - ignored leads
    // - proposal delays

    // Get job_value_lost from estimator scorecards (most recent period)
    const { data: recentScorecards, error: scorecardsError } = await supabase
      .from("estimator_scorecards")
      .select("job_value_lost")
      .eq("workspace_id", workspace_id)
      .not("job_value_lost", "is", null)
      .order("period_end", { ascending: false })
      .limit(10);

    if (scorecardsError) {
      console.error("Error fetching scorecards for leakage:", scorecardsError);
    }

    // Sum up job_value_lost from recent scorecards
    leakage = (recentScorecards || []).reduce((sum, sc) => {
      return sum + parseFloat(String(sc.job_value_lost || 0));
    }, 0);

    // Also check for leads with high estimated_value but low probability (potential leakage)
    (leads || []).forEach((lead) => {
      const value = parseFloat(
        String(lead.estimated_job_value || lead.estimated_value || 0)
      );
      const probability = lead.job_probability || 0;

      // If lead has high value but low probability, it might be leakage
      // This is a heuristic - actual leakage should come from scorecards
      if (value > 5000 && probability < 30) {
        // Potential leakage, but don't double count
        // leakage += value * 0.1; // 10% of high-value low-probability leads
      }
    });

    // ============================================================================
    // 5. INSERT FORECAST SNAPSHOT
    // ============================================================================

    const forecastDate = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    const { data: inserted, error: insertError } = await supabase
      .from("revenue_forecasts")
      .upsert(
        {
          workspace_id,
          forecast_date: forecastDate,
          forecast_weighted: Math.round(weighted * 100) / 100,
          forecast_best_case: Math.round(bestCase * 100) / 100,
          forecast_worst_case: Math.round(worstCase * 100) / 100,
          forecast_historical: Math.round(historical * 100) / 100,
          revenue_leakage: Math.round(leakage * 100) / 100,
          estimator_breakdown: estimatorMap,
        },
        {
          onConflict: "workspace_id,forecast_date",
        }
      )
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting forecast:", insertError);
      throw insertError;
    }

    console.log(`[Revenue Forecast] Forecast computed successfully for workspace ${workspace_id}`);

    return new Response(
      JSON.stringify({
        success: true,
        workspace_id,
        forecast: inserted,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});









































