// Block 22920 — SmartSend Roofing AI Intelligence Layer v1
// Edge Function — AI Intelligence Engine
// This is the brain that analyzes jobs and generates insights, risks, and recommendations

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";
import OpenAI from "https://esm.sh/openai@4.56.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const openai = new OpenAI({ apiKey: openaiApiKey });

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
    const { job_id, workspace_id } = await req.json();

    if (!job_id || !workspace_id) {
      return new Response(
        JSON.stringify({ error: "job_id and workspace_id required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // 1️⃣ Pull job data
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("*")
      .eq("id", job_id)
      .eq("workspace_id", workspace_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // 2️⃣ Pull material orders
    const { data: materials } = await supabase
      .from("material_orders")
      .select("*, material_order_items(*)")
      .eq("job_id", job_id)
      .eq("workspace_id", workspace_id);

    // 3️⃣ Pull forecast data (from forecast variance function)
    let forecastData = null;
    try {
      const forecastRes = await fetch(
        `${supabaseUrl}/functions/v1/jobs-forecast-variance`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseServiceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ job_id, workspace_id }),
        }
      );
      if (forecastRes.ok) {
        forecastData = await forecastRes.json();
      }
    } catch (e) {
      console.error("Error fetching forecast:", e);
    }

    // 4️⃣ Pull invoices and payments
    const { data: invoices } = await supabase
      .from("job_invoices")
      .select("*, job_payments(*)")
      .eq("job_id", job_id)
      .eq("workspace_id", workspace_id);

    // 5️⃣ Pull field notes
    const { data: fieldNotes } = await supabase
      .from("job_field_notes")
      .select("*")
      .eq("job_id", job_id)
      .order("created_at", { ascending: false })
      .limit(10);

    // 6️⃣ Pull production schedule data
    const { data: productionSlots } = await supabase
      .from("production_slots")
      .select("*")
      .eq("job_id", job_id)
      .gte("scheduled_date", new Date().toISOString().split("T")[0])
      .order("scheduled_date", { ascending: true })
      .limit(5);

    // 7️⃣ Build AI prompt
    const prompt = `You are SmartSend AI — the roofing operations intelligence engine.

Analyze this roofing job for risks, insights, or recommendations.

JOB DATA:
${JSON.stringify({
  id: job.id,
  title: job.title,
  address: job.address,
  job_value: job.job_value,
  supplement_amount: job.supplement_amount,
  progress_percent: job.progress_percent,
  status: job.status,
  estimated_material_cost: job.estimated_material_cost,
  estimated_labor_cost: job.estimated_labor_cost,
  target_profit_margin: job.target_profit_margin,
  scheduled_start_date: job.scheduled_start_date,
  scheduled_end_date: job.scheduled_end_date,
}, null, 2)}

FORECAST DATA:
${JSON.stringify(forecastData, null, 2)}

MATERIAL ORDERS:
${JSON.stringify(materials || [], null, 2)}

INVOICES & PAYMENTS:
${JSON.stringify(invoices || [], null, 2)}

FIELD NOTES (recent):
${JSON.stringify(fieldNotes || [], null, 2)}

PRODUCTION SCHEDULE:
${JSON.stringify(productionSlots || [], null, 2)}

Analyze this job and produce insights. Return a JSON array of insights, each with:
- category: one of "margin_risk", "schedule_risk", "material_risk", "labor_risk", "payment_risk", "forecast_update", "general_insight"
- severity: "info", "warning", or "critical"
- message: a clear, actionable message (2-3 sentences max)
- recommendation: optional actionable recommendation (1-2 sentences)

Focus on:
1. Margin risks (if forecast margin is dropping)
2. Schedule risks (if delays are likely)
3. Material risks (if costs are rising or delays expected)
4. Labor risks (if hours are burning too fast)
5. Payment risks (if invoices unpaid and job progressing)
6. Forecast updates (if progress changed significantly)
7. General insights (crew efficiency, supplier issues, etc.)

Return ONLY valid JSON array, no markdown, no code blocks. Example:
[
  {
    "category": "margin_risk",
    "severity": "critical",
    "message": "Job at 742 Cedar Ave will finish 12% over budget unless labor hours are adjusted. Current forecast margin is 23%, below target of 35%.",
    "recommendation": "Review labor allocation. Consider reassigning crew or adjusting schedule to reduce overtime."
  }
]`;

    // 8️⃣ Call OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a roofing operations intelligence system. Analyze job data and return structured insights. Always return a JSON object with an 'insights' key containing an array of insight objects.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error("No response from OpenAI");
    }

    // Parse response (OpenAI returns JSON object when response_format is json_object)
    let insights: any[] = [];
    try {
      const parsed = JSON.parse(responseText);
      // Handle wrapped object (preferred format)
      if (parsed.insights && Array.isArray(parsed.insights)) {
        insights = parsed.insights;
      } else if (parsed.data && Array.isArray(parsed.data)) {
        insights = parsed.data;
      } else if (Array.isArray(parsed)) {
        // Direct array (fallback)
        insights = parsed;
      } else {
        // Try to extract array from any key
        const values = Object.values(parsed);
        if (values.length > 0 && Array.isArray(values[0])) {
          insights = values[0] as any[];
        } else {
          console.warn("Unexpected response format from OpenAI:", parsed);
        }
      }
    } catch (parseError) {
      console.error("Failed to parse OpenAI response:", responseText);
      // Try to extract JSON array from text as fallback
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          insights = JSON.parse(jsonMatch[0]);
        } catch (e) {
          console.error("Failed to parse extracted JSON:", e);
        }
      }
    }

    // 9️⃣ Insert insights into database
    if (insights.length > 0) {
      // Mark old unresolved insights as resolved (to avoid duplicates)
      await supabase
        .from("ai_insights")
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq("job_id", job_id)
        .eq("resolved", false);

      // Insert new insights
      const insightsToInsert = insights.map((insight) => ({
        workspace_id,
        job_id,
        category: insight.category,
        severity: insight.severity || "info",
        message: insight.message,
        recommendation: insight.recommendation || null,
        resolved: false,
      }));

      const { error: insertError } = await supabase
        .from("ai_insights")
        .insert(insightsToInsert);

      if (insertError) {
        console.error("Error inserting insights:", insertError);
        return new Response(
          JSON.stringify({ error: "Failed to save insights", details: insertError.message }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        insights_generated: insights.length,
        insights,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err: any) {
    console.error("Error in AI intel engine:", err);
    return new Response(
      JSON.stringify({
        error: err.message || "Internal server error",
        stack: err.stack,
      }),
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

