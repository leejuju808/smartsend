import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { workspace_id } = await req.json();

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "workspace_id required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get metrics from billing_metrics view
    const { data: m, error: metricsError } = await supabase
      .from("billing_metrics")
      .select("*")
      .eq("workspace_id", workspace_id)
      .single();

    if (metricsError) {
      return new Response(
        JSON.stringify({ error: metricsError.message }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Linear forecast: average daily rate over 7 days, projected to 30 days
    const sends_per_day = m.sends_7d > 0 ? m.sends_7d / 7 : 0;
    const replies_per_day = m.replies_7d > 0 ? m.replies_7d / 7 : 0;

    const sends_forecast_30d = Math.round(sends_per_day * 30);
    const replies_forecast_30d = Math.round(replies_per_day * 30);

    // Get workspace daily send cap for nudge calculation
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("default_daily_send_cap")
      .eq("id", workspace_id)
      .single();

    const daily_send_cap = workspace?.default_daily_send_cap || 200;

    // Get today's usage for nudge calculation
    const { data: usage } = await supabase
      .from("billing_usage_daily")
      .select("sends_today")
      .eq("workspace_id", workspace_id)
      .single();

    const sends_today = usage?.sends_today || 0;

    // Determine nudge level
    let nudge: "none" | "warning" | "upgrade_soon" | "critical" = "none";

    if (sends_forecast_30d > daily_send_cap * 30 * 2) {
      nudge = "critical";
    } else if (sends_forecast_30d > daily_send_cap * 30 * 1.5) {
      nudge = "upgrade_soon";
    } else if (sends_today > daily_send_cap * 0.8) {
      nudge = "warning";
    }

    return new Response(
      JSON.stringify({
        sends_forecast_30d,
        replies_forecast_30d,
        metrics: m,
        nudge,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

