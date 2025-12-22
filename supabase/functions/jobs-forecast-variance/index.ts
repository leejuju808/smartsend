// Block 22600 — SmartSend Roofing Job Forecasting & Variance Alerts v1
// Edge Function — Calculate Forecast vs Budget and Create Variance Alerts
// Returns forecast numbers and creates alerts when thresholds are breached

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.6";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
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
    const { job_id, workspace_id } = await req.json();

    if (!job_id || !workspace_id) {
      return new Response(
        JSON.stringify({ error: "job_id and workspace_id required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // 1) Job info
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select(
        "id, workspace_id, job_value, supplement_amount, estimated_material_cost, estimated_labor_cost, target_profit_margin, progress_percent"
      )
      .eq("id", job_id)
      .eq("workspace_id", workspace_id)
      .single();

    if (jobError) throw jobError;
    if (!job) throw new Error("Job not found");

    const contract = Number(job.job_value ?? 0);
    const supplement = Number(job.supplement_amount ?? 0);
    const estMat = Number(job.estimated_material_cost ?? 0);
    const estLab = Number(job.estimated_labor_cost ?? 0);
    const targetMargin = Number(job.target_profit_margin ?? 35);
    const progress = Number(job.progress_percent ?? 0);

    const totalRevenue = contract + supplement;

    // 2) Approved change orders
    const { data: coRows, error: coError } = await supabase
      .from("job_change_orders")
      .select("amount")
      .eq("job_id", job_id)
      .eq("status", "approved");

    if (coError) {
      console.error("Error fetching change orders:", coError);
    }

    const changeOrderTotal = (coRows || []).reduce(
      (sum, c) => sum + Number(c.amount),
      0
    );

    const revenueWithCO = totalRevenue + changeOrderTotal;

    // 3) Actual material cost
    const { data: orders, error: ordersError } = await supabase
      .from("material_orders")
      .select("id, job_id")
      .eq("job_id", job_id)
      .eq("workspace_id", workspace_id);

    if (ordersError) {
      console.error("Error fetching material orders:", ordersError);
    }

    const orderIdSet = new Set((orders || []).map((o) => o.id));

    let actualMaterialCost = 0;
    if (orderIdSet.size > 0) {
      const { data: items, error: itemsError } = await supabase
        .from("material_order_items")
        .select("total_price, material_order_id")
        .in("material_order_id", Array.from(orderIdSet));

      if (itemsError) {
        console.error("Error fetching material order items:", itemsError);
      } else {
        actualMaterialCost = (items || []).reduce(
          (sum, i) => sum + Number(i.total_price || 0),
          0
        );
      }
    }

    // 4) Actual labor cost
    const { data: laborRows, error: laborError } = await supabase
      .from("job_labor_costs")
      .select("total_cost")
      .eq("job_id", job_id);

    if (laborError) {
      console.error("Error fetching labor costs:", laborError);
    }

    const actualLaborCost = (laborRows || []).reduce(
      (sum, l) => sum + Number(l.total_cost || 0),
      0
    );

    // 5) Forecast costs based on progress
    let forecastMat = estMat;
    let forecastLab = estLab;

    if (progress > 0) {
      const ratio = progress / 100;
      forecastMat = Math.max(actualMaterialCost, actualMaterialCost / ratio);
      forecastLab = Math.max(actualLaborCost, actualLaborCost / ratio);
    } else {
      // no progress yet → assume budget
      forecastMat = estMat || actualMaterialCost;
      forecastLab = estLab || actualLaborCost;
    }

    const forecastTotalCost = forecastMat + forecastLab;
    const forecastProfit = revenueWithCO - forecastTotalCost;
    const forecastMargin =
      revenueWithCO > 0 ? (forecastProfit / revenueWithCO) * 100 : 0;

    const budgetTotalCost = estMat + estLab;
    const budgetProfit = revenueWithCO - budgetTotalCost;
    const budgetMargin =
      revenueWithCO > 0 ? (budgetProfit / revenueWithCO) * 100 : 0;

    const profitVariance = forecastProfit - budgetProfit;
    const profitVariancePercent =
      budgetProfit !== 0 ? (profitVariance / budgetProfit) * 100 : 0;

    // 6) Clear old open alerts for freshness (optional but nice)
    await supabase
      .from("job_variance_alerts")
      .update({ status: "resolved" })
      .eq("job_id", job_id)
      .eq("status", "open");

    // 7) Create new alerts if needed
    const alertsToInsert: any[] = [];

    if (estMat > 0 && forecastMat > estMat * 1.1) {
      alertsToInsert.push({
        workspace_id,
        job_id,
        type: "material_overrun",
        severity: forecastMat > estMat * 1.2 ? "critical" : "warning",
        budget_value: estMat,
        forecast_value: forecastMat,
        variance_value: forecastMat - estMat,
        variance_percent: ((forecastMat - estMat) / estMat) * 100,
        message: "Material cost is forecast to exceed budget by more than 10%.",
      });
    }

    if (estLab > 0 && forecastLab > estLab * 1.1) {
      alertsToInsert.push({
        workspace_id,
        job_id,
        type: "labor_overrun",
        severity: forecastLab > estLab * 1.2 ? "critical" : "warning",
        budget_value: estLab,
        forecast_value: forecastLab,
        variance_value: forecastLab - estLab,
        variance_percent: ((forecastLab - estLab) / estLab) * 100,
        message: "Labor cost is forecast to exceed budget by more than 10%.",
      });
    }

    if (forecastMargin < targetMargin - 5) {
      alertsToInsert.push({
        workspace_id,
        job_id,
        type: "margin_risk",
        severity: forecastMargin < targetMargin - 10 ? "critical" : "warning",
        budget_value: targetMargin,
        forecast_value: forecastMargin,
        variance_value: forecastMargin - targetMargin,
        variance_percent: profitVariancePercent,
        message: "Forecast profit margin is trending below target.",
      });
    }

    if (forecastMargin < 25) {
      alertsToInsert.push({
        workspace_id,
        job_id,
        type: "overall_risk",
        severity: "critical",
        budget_value: budgetMargin,
        forecast_value: forecastMargin,
        variance_value: forecastMargin - budgetMargin,
        variance_percent: profitVariancePercent,
        message: "Job is trending toward low-margin or loss if nothing changes.",
      });
    }

    if (alertsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("job_variance_alerts")
        .insert(alertsToInsert);

      if (insertError) {
        console.error("Error inserting alerts:", insertError);
      }
    }

    return new Response(
      JSON.stringify({
        job_id,
        revenue: revenueWithCO,
        actual_costs: {
          material: actualMaterialCost,
          labor: actualLaborCost,
        },
        forecast: {
          material: forecastMat,
          labor: forecastLab,
          total_cost: forecastTotalCost,
          profit: forecastProfit,
          margin: forecastMargin,
        },
        budget: {
          material: estMat,
          labor: estLab,
          total_cost: budgetTotalCost,
          profit: budgetProfit,
          margin: budgetMargin,
        },
        profit_variance: profitVariance,
        profit_variance_percent: profitVariancePercent,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (err: any) {
    console.error("Error in forecast variance:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
});







































