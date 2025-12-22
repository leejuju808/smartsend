// Block 22029 — SmartSend Roofing Estimator Scorecard v1
// Edge Function — Get Estimator Scorecard Data
// Returns scorecard metrics + job breakdown for coaching

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { workspace_id, estimator_id } = await req.json();

    if (!workspace_id || !estimator_id) {
      return new Response(
        JSON.stringify({ error: "Missing required parameters: workspace_id and estimator_id" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // 1) Fetch core scorecard metrics from view
    const { data: card, error: cardError } = await supabase
      .from("estimator_scorecard_view")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("estimator_id", estimator_id)
      .single();

    if (cardError) {
      console.error("Error fetching scorecard:", cardError);
      return new Response(
        JSON.stringify({ error: cardError.message }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // 2) Fetch this estimator's active jobs grouped by health
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select(
        "id, name, first_name, last_name, status, job_health_score, job_health_trend, estimated_job_value, momentum_score, homeowner_experience_score, risk_category"
      )
      .eq("workspace_id", workspace_id)
      .eq("estimator_id", estimator_id)
      .not("status", "in", ["won", "lost"]);

    if (leadsError) {
      console.error("Error fetching leads:", leadsError);
      return new Response(
        JSON.stringify({ error: leadsError.message }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const healthy: any[] = [];
    const watchlist: any[] = [];
    const atRisk: any[] = [];

    (leads || []).forEach((l) => {
      const healthScore = l.job_health_score ?? 0;
      const homeownerName = l.name || 
        (l.first_name && l.last_name ? `${l.first_name} ${l.last_name}` : null) ||
        l.first_name ||
        "Homeowner";

      const jobData = {
        id: l.id,
        homeowner_name: homeownerName,
        status: l.status,
        job_health_score: healthScore,
        job_health_trend: l.job_health_trend,
        estimated_value: l.estimated_job_value || 0,
        momentum_score: l.momentum_score,
        homeowner_experience_score: l.homeowner_experience_score,
        risk_category: l.risk_category,
      };

      if (healthScore >= 75) {
        healthy.push(jobData);
      } else if (healthScore >= 50) {
        watchlist.push(jobData);
      } else {
        atRisk.push(jobData);
      }
    });

    // 3) Fetch top win/loss reasons (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

    const { data: won } = await supabase
      .from("leads")
      .select("win_reason")
      .eq("workspace_id", workspace_id)
      .eq("estimator_id", estimator_id)
      .eq("status", "won")
      .gte("updated_at", thirtyDaysAgo);

    const { data: lost } = await supabase
      .from("leads")
      .select("loss_reason")
      .eq("workspace_id", workspace_id)
      .eq("estimator_id", estimator_id)
      .eq("status", "lost")
      .gte("updated_at", thirtyDaysAgo);

    const winReasons = countReasons(won?.map((w: any) => w.win_reason) || []);
    const lossReasons = countReasons(lost?.map((l: any) => l.loss_reason) || []);

    return new Response(
      JSON.stringify({
        scorecard: card,
        jobs: {
          healthy,
          watchlist,
          atRisk,
        },
        reasons: {
          wins: winReasons,
          losses: lossReasons,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error: any) {
    console.error("[Get Estimator Scorecard] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
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

function countReasons(list: (string | null | undefined)[]): Array<{ reason: string; count: number }> {
  const map: Record<string, number> = {};
  for (const r of list) {
    if (!r) continue;
    map[r] = (map[r] || 0) + 1;
  }
  return Object.entries(map)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}









































