// Block 26020 — SmartSend Roofing Profit Engine v1
// Real-time margin checking edge function
// Warns if job margin drops below 30%

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { job_id } = await req.json();

    if (!job_id) {
      return new Response(
        JSON.stringify({ error: "job_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get profit record
    const { data: profit, error: profitError } = await supabase
      .from("roofing_job_profit")
      .select("*")
      .eq("job_id", job_id)
      .single();

    if (profitError || !profit) {
      // Try to recalculate profit
      const { error: recalcError } = await supabase.rpc("recalc_job_profit", {
        p_job_id: job_id,
      });

      if (recalcError) {
        return new Response(
          JSON.stringify({ error: "No profit record found", details: recalcError.message }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Retry fetching profit
      const { data: retryProfit } = await supabase
        .from("roofing_job_profit")
        .select("*")
        .eq("job_id", job_id)
        .single();

      if (!retryProfit) {
        return new Response(
          JSON.stringify({ error: "Could not calculate profit" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Check margin and create alert if needed
      await supabase.rpc("check_margin_alerts_v2", {
        p_job_id: job_id,
      });

      return new Response(
        JSON.stringify({
          margin: retryProfit.margin,
          gross_profit: retryProfit.gross_profit,
          material_cost: retryProfit.material_cost,
          labor_cost: retryProfit.labor_cost,
          supplement_revenue: retryProfit.supplement_revenue,
          final_revenue: retryProfit.final_revenue || retryProfit.estimated_revenue,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check margin and create alert if needed
    await supabase.rpc("check_margin_alerts_v2", {
      p_job_id: job_id,
    });

    return new Response(
      JSON.stringify({
        margin: profit.margin,
        gross_profit: profit.gross_profit,
        material_cost: profit.material_cost,
        labor_cost: profit.labor_cost,
        supplement_revenue: profit.supplement_revenue,
        final_revenue: profit.final_revenue || profit.estimated_revenue,
        warning: profit.margin < 30 ? "Low margin warning" : null,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});



































