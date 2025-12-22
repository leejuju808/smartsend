// Block 22640 — SmartSend Roofing Owner Command Center v1
// Edge Function — Aggregates ALL dashboard data for the owner's daily control panel
// Returns prioritized jobs, alerts, suppliers, and forecasts in one response

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
    const { workspace_id } = await req.json();

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "workspace_id required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // 1️⃣ Get all jobs for the workspace
    const { data: jobs, error: jobsError } = await supabase
      .from("roofing_jobs")
      .select("id, title, address, job_value, supplement_amount, progress_percent, estimated_material_cost, estimated_labor_cost, target_profit_margin, status")
      .eq("workspace_id", workspace_id)
      .order("created_at", { ascending: false });

    if (jobsError) {
      console.error("Error fetching jobs:", jobsError);
    }

    // 2️⃣ Get variance alerts (open only)
    const { data: varianceAlerts, error: varianceError } = await supabase
      .from("job_variance_alerts")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("status", "open")
      .order("created_at", { ascending: false });

    if (varianceError) {
      console.error("Error fetching variance alerts:", varianceError);
    }

    // 3️⃣ Get material cost spike alerts
    const { data: priceAlerts, error: priceError } = await supabase
      .from("material_price_alerts")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("status", "open")
      .order("created_at", { ascending: false });

    if (priceError) {
      console.error("Error fetching price alerts:", priceError);
    }

    // 4️⃣ Supplier reliability
    const { data: suppliers, error: suppliersError } = await supabase
      .from("suppliers")
      .select("id, name, reliability_score, total_orders, on_time_rate, avg_delay_days")
      .eq("workspace_id", workspace_id)
      .eq("is_active", true)
      .order("reliability_score", { ascending: false });

    if (suppliersError) {
      console.error("Error fetching suppliers:", suppliersError);
    }

    // 4.5️⃣ AI Insights (unresolved only)
    const { data: aiInsights, error: aiInsightsError } = await supabase
      .from("ai_insights")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("resolved", false)
      .order("created_at", { ascending: false })
      .limit(20);

    if (aiInsightsError) {
      console.error("Error fetching AI insights:", aiInsightsError);
    }

    // 5️⃣ For each job, fetch the forecast + profit snapshot
    const jobDetails: any[] = [];
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    for (const job of jobs || []) {
      try {
        // Fetch forecast variance
        const forecastRes = await fetch(
          `${supabaseUrl}/functions/v1/jobs-forecast-variance`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              job_id: job.id,
              workspace_id,
            }),
          }
        );

        let forecastData = null;
        if (forecastRes.ok) {
          forecastData = await forecastRes.json();
        } else {
          console.error(`Forecast error for job ${job.id}:`, await forecastRes.text());
        }

        // Fetch profit snapshot
        const profitRes = await fetch(
          `${supabaseUrl}/functions/v1/jobs-profit-snapshot`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${serviceRoleKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              job_id: job.id,
              workspace_id,
            }),
          }
        );

        let profitData = null;
        if (profitRes.ok) {
          profitData = await profitRes.json();
        } else {
          console.error(`Profit snapshot error for job ${job.id}:`, await profitRes.text());
        }

        jobDetails.push({
          job,
          forecast: forecastData,
          profit: profitData,
        });
      } catch (err) {
        console.error(`Error processing job ${job.id}:`, err);
        // Still include the job even if forecast/profit fetch failed
        jobDetails.push({
          job,
          forecast: null,
          profit: null,
        });
      }
    }

    // 6️⃣ Build priority list (highest risk first)
    // Sort by forecast margin (lowest first = highest risk)
    const prioritizedJobs = jobDetails
      .filter((jd) => jd.forecast?.forecast?.margin !== undefined)
      .sort((a, b) => {
        const marginA = a.forecast?.forecast?.margin ?? 100;
        const marginB = b.forecast?.forecast?.margin ?? 100;
        return marginA - marginB;
      })
      .slice(0, 5);

    // 7️⃣ Categorize suppliers by reliability
    const supplierCategories = {
      elite: (suppliers || []).filter((s: any) => (s.reliability_score ?? 0) >= 80),
      solid: (suppliers || []).filter((s: any) => {
        const score = s.reliability_score ?? 0;
        return score >= 60 && score < 80;
      }),
      risky: (suppliers || []).filter((s: any) => (s.reliability_score ?? 0) < 60),
    };

    return new Response(
      JSON.stringify({
        workspace_id,
        jobs: jobDetails,
        prioritized_jobs: prioritizedJobs,
        variance_alerts: varianceAlerts || [],
        price_alerts: priceAlerts || [],
        suppliers: suppliers || [],
        supplier_categories: supplierCategories,
        ai_insights: aiInsights || [],
        summary: {
          total_jobs: jobs?.length || 0,
          open_variance_alerts: varianceAlerts?.length || 0,
          open_price_alerts: priceAlerts?.length || 0,
          total_suppliers: suppliers?.length || 0,
          ai_insights_count: aiInsights?.length || 0,
        },
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
    console.error("Error in owner command center:", err);
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

