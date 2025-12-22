// Block 26110 — SmartSend Roofing Cashflow Forecast v1
// Edge function to forecast cashflow for a workspace (30/60/90 days)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ForecastInput {
  workspace_id: string;
  days?: number; // 30, 60, or 90 (default: 90)
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
    let days = 90;

    if (req.method === "POST") {
      const body: ForecastInput = await req.json();
      workspace_id = body.workspace_id || null;
      days = body.days || 90;
    } else if (req.method === "GET") {
      const url = new URL(req.url);
      workspace_id = url.searchParams.get("workspace_id");
      const daysParam = url.searchParams.get("days");
      if (daysParam) {
        days = parseInt(daysParam, 10);
      }
    }

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: workspace_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate days
    if (![30, 60, 90].includes(days)) {
      days = 90;
    }

    const today = new Date();
    const endDate = new Date();
    endDate.setDate(today.getDate() + days);

    // Get cashflow events for the forecast period
    const { data: events, error: eventsError } = await supabase
      .from("roofing_cashflow_events")
      .select("*")
      .eq("workspace_id", workspace_id)
      .gte("expected_date", today.toISOString().split("T")[0])
      .lte("expected_date", endDate.toISOString().split("T")[0])
      .eq("actual", false)
      .order("expected_date", { ascending: true });

    if (eventsError) {
      console.error("Error fetching cashflow events:", eventsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch cashflow events" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build forecast timeline
    const timeline: Record<string, { incoming: number; outgoing: number; net: number }> = {};

    // Initialize all days in the range
    for (let d = new Date(today); d <= endDate; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().split("T")[0];
      timeline[key] = { incoming: 0, outgoing: 0, net: 0 };
    }

    // Aggregate events by day
    for (const event of events || []) {
      const day = event.expected_date;
      if (!timeline[day]) continue;

      const amount = Number(event.amount) || 0;

      if (event.type === "incoming") {
        timeline[day].incoming += amount;
      } else if (event.type === "outgoing") {
        timeline[day].outgoing += amount;
      }
    }

    // Calculate net for each day
    for (const day in timeline) {
      const t = timeline[day];
      t.net = t.incoming - t.outgoing;
    }

    // Calculate cumulative net (running balance)
    let runningBalance = 0;
    const sortedDays = Object.keys(timeline).sort();
    for (const day of sortedDays) {
      runningBalance += timeline[day].net;
      timeline[day] = {
        ...timeline[day],
        cumulative: runningBalance,
      };
    }

    // Find red flag days (negative cashflow)
    const redFlagDays = Object.entries(timeline)
      .filter(([_, v]) => v.net < 0)
      .map(([day, v]) => ({
        day,
        net: v.net,
        incoming: v.incoming,
        outgoing: v.outgoing,
      }));

    // Calculate summary statistics
    const totalIncoming = Object.values(timeline).reduce((sum, v) => sum + v.incoming, 0);
    const totalOutgoing = Object.values(timeline).reduce((sum, v) => sum + v.outgoing, 0);
    const totalNet = totalIncoming - totalOutgoing;
    const minNet = Math.min(...Object.values(timeline).map((v) => v.net));
    const minCumulative = Math.min(...Object.values(timeline).map((v) => (v as any).cumulative || 0));

    return new Response(
      JSON.stringify({
        workspace_id,
        days,
        start_date: today.toISOString().split("T")[0],
        end_date: endDate.toISOString().split("T")[0],
        timeline,
        summary: {
          total_incoming: totalIncoming,
          total_outgoing: totalOutgoing,
          total_net: totalNet,
          min_daily_net: minNet,
          min_cumulative_balance: minCumulative,
          red_flag_days_count: redFlagDays.length,
        },
        red_flag_days: redFlagDays,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Cashflow forecast error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});



































