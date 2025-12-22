// supabase/functions/revenue-recalculate/index.ts
// Block 11500 — SmartSend Roofing Revenue Estimator v1
// Edge function to recalculate revenue estimator metrics

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  // Allow POST and GET (GET for cron triggers)
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    let workspace_id: string | null = null;
    let user_id: string | null = null;

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      workspace_id = body.workspace_id || null;
      user_id = body.user_id || null;
    } else {
      // GET request - parse query params
      const url = new URL(req.url);
      workspace_id = url.searchParams.get("workspace_id");
      user_id = url.searchParams.get("user_id");
    }

    // If workspace_id provided, use recalculate_revenue_estimator (finds user automatically)
    if (workspace_id) {
      const { error } = await supabase.rpc("recalculate_revenue_estimator", {
        p_workspace_id: workspace_id,
      });

      if (error) {
        console.error("Error recalculating revenue estimator:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      // Fetch the updated metrics
      const { data: metrics, error: fetchError } = await supabase
        .from("dashboard_metrics")
        .select("*")
        .eq("workspace_id", workspace_id)
        .maybeSingle();

      if (fetchError) {
        console.error("Error fetching dashboard metrics:", fetchError);
        return new Response(
          JSON.stringify({ error: fetchError.message }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          workspace_id,
          metrics: metrics || null 
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // If both workspace_id and user_id provided, use calculate_dashboard_metrics directly
    if (workspace_id && user_id) {
      const { error } = await supabase.rpc("calculate_dashboard_metrics", {
        p_workspace_id: workspace_id,
        p_user_id: user_id,
      });

      if (error) {
        console.error("Error calculating dashboard metrics:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      // Fetch the updated metrics
      const { data: metrics, error: fetchError } = await supabase
        .from("dashboard_metrics")
        .select("*")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user_id)
        .single();

      if (fetchError) {
        console.error("Error fetching dashboard metrics:", fetchError);
        return new Response(
          JSON.stringify({ error: fetchError.message }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, metrics }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // If no workspace_id provided, return error
    return new Response(
      JSON.stringify({ error: "Missing required field: workspace_id" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});























































