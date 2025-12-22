// Block 22064 — SmartSend Roofing Estimator Leaderboard v1
// Edge Function — Get Estimator Leaderboard Data
// Returns ranked list of estimators for competitive scoreboard

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
    const { workspace_id, range } = await req.json() as {
      workspace_id: string;
      range?: "7d" | "30d" | "90d";
    };

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "Missing required parameter: workspace_id" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // V1: Hardcode to 30d (can extend later to support range parameter)
    // For now, we'll use the view which is hardcoded to 30d
    const { data, error } = await supabase
      .from("estimator_leaderboard_view")
      .select("*")
      .eq("workspace_id", workspace_id);

    if (error) {
      console.error("Error fetching leaderboard:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Rank by performance score, then revenue
    const ranked = (data || []).sort((a, b) => {
      const scoreA = a.performance_score ?? 0;
      const scoreB = b.performance_score ?? 0;
      
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      
      // If scores are equal, rank by revenue
      const revenueA = a.revenue_won_30d ?? 0;
      const revenueB = b.revenue_won_30d ?? 0;
      return revenueB - revenueA;
    });

    // Add rank to each row
    ranked.forEach((row, idx) => {
      (row as any).rank = idx + 1;
    });

    return new Response(
      JSON.stringify(ranked),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error: any) {
    console.error("[Get Estimator Leaderboard] Error:", error);
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









































