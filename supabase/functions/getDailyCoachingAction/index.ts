// Block 95000 — Dynamic Coaching Agent + Action Scoring Model
// Edge Function — Get Daily Coaching Action
// Returns the ONE most important thing the owner should do today

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "Missing required parameter: user_id" }),
        { 
          status: 400, 
          headers: { 
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
    }

    // 1. Get all coaching actions
    const { data: actions, error: actionsError } = await supabase
      .from("coaching_actions")
      .select("*")
      .order("points", { ascending: false });

    if (actionsError) {
      throw new Error(`Failed to fetch coaching actions: ${actionsError.message}`);
    }

    if (!actions || actions.length === 0) {
      return new Response(
        JSON.stringify({ error: "No coaching actions found" }),
        { 
          status: 404, 
          headers: { 
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
    }

    // 2. Check user behavior (last 24 hours)
    const { data: logs, error: logsError } = await supabase
      .from("user_actions")
      .select("*")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false });

    if (logsError) {
      console.error("Error fetching user actions:", logsError);
      // Continue without logs if there's an error
    }

    const last24 = (logs || []).filter(
      (l: any) => new Date(l.created_at) > new Date(Date.now() - 86400000)
    );

    // 3. Scoring logic with penalties
    const scored = actions.map((a: any) => {
      let score = a.points;

      // Penalties for actions already done today
      if (a.key === "send_daily_batch" && last24.some((l: any) => l.action_key === "send_daily_batch")) {
        score -= 40;
      }

      if (a.key === "respond_to_hot_leads" && last24.some((l: any) => l.action_key === "respond_to_hot_leads")) {
        score -= 20;
      }

      if (a.key === "personalize_opener" && last24.some((l: any) => l.action_key === "personalize_opener")) {
        score -= 15;
      }

      // Check for hot leads (boost respond_to_hot_leads if they exist)
      if (a.key === "respond_to_hot_leads") {
        // We'll check for hot leads in the workspace
        // For now, we'll boost the score if it hasn't been done today
        if (!last24.some((l: any) => l.action_key === "respond_to_hot_leads")) {
          score += 10; // Boost if not done today
        }
      }

      return { ...a, score };
    });

    // 4. Pick highest score
    const best = scored.sort((a: any, b: any) => b.score - a.score)[0];

    return new Response(
      JSON.stringify(best),
      { 
        status: 200, 
        headers: { 
          "Content-Type": "application/json",
          'Access-Control-Allow-Origin': '*',
        } 
      }
    );
  } catch (error: any) {
    console.error("getDailyCoachingAction error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { 
        status: 500, 
        headers: { 
          "Content-Type": "application/json",
          'Access-Control-Allow-Origin': '*',
        } 
      }
    );
  }
});


























