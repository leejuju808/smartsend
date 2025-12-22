// Block 61000 — SmartSend Roofing "AI Profit Maximizer + Pricing Optimization Engine" v1
// Edge Function: /profit/ai-pricing
// AI generates pricing recommendations based on costs, history, season, complexity, market

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

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
    const {
      job_id,
      material_costs = {},
      labor_rates = {},
      square_footage,
      roof_type,
      complexity,
      season,
      neighborhood_value,
    } = await req.json();

    if (!job_id) {
      return new Response(
        JSON.stringify({ error: "job_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get historical job performance for this team
    const { data: historicalJobs } = await supabase
      .from("profit_analysis")
      .select("revenue, actual_profit, margin_percent")
      .eq("team_id", job.team_id)
      .not("revenue", "is", null)
      .order("created_at", { ascending: false })
      .limit(20);

    // Calculate average margin from history
    const avgMargin = historicalJobs && historicalJobs.length > 0
      ? historicalJobs.reduce((sum, j) => sum + (j.margin_percent || 0), 0) / historicalJobs.length
      : 35; // Default 35% margin

    // Calculate base costs
    const materialCost = Object.values(material_costs).reduce(
      (sum: number, cost: any) => sum + Number(cost || 0),
      0
    ) || 0;

    const laborCost = Object.values(labor_rates).reduce(
      (sum: number, rate: any) => sum + Number(rate || 0),
      0
    ) || 0;

    const baseCost = materialCost + laborCost;
    const overhead = baseCost * 0.15; // 15% overhead
    const totalCost = baseCost + overhead;

    // Calculate minimum profitable price (target 30% margin)
    const minimum_price = totalCost / 0.70; // 30% margin minimum

    // Calculate recommended price (target 40% margin)
    const recommended_price = totalCost / 0.60; // 40% margin target

    // Calculate high-value price (target 50% margin for premium neighborhoods)
    const high_value_price = neighborhood_value === "high"
      ? totalCost / 0.50 // 50% margin
      : recommended_price * 1.15; // 15% premium

    // Build AI reasoning using OpenAI
    const prompt = `You are a roofing pricing expert. Analyze this roofing job and provide pricing recommendations.

Job Details:
- Material Cost: $${materialCost.toFixed(2)}
- Labor Cost: $${laborCost.toFixed(2)}
- Total Cost: $${totalCost.toFixed(2)}
- Square Footage: ${square_footage || "unknown"}
- Roof Type: ${roof_type || "standard"}
- Complexity: ${complexity || "medium"}
- Season: ${season || "standard"}
- Neighborhood Value: ${neighborhood_value || "standard"}

Historical Performance:
- Average Margin: ${avgMargin.toFixed(1)}%
- Recent Jobs Analyzed: ${historicalJobs?.length || 0}

Provide a JSON response with:
1. reasoning - Why these prices are recommended
2. factors - Key factors influencing the pricing
3. risk_assessment - Any risks to consider
4. market_comparison - How this compares to market rates

Return ONLY valid JSON.`;

    let aiReasoning = {};
    try {
      const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "You are a roofing pricing expert. Always return valid JSON only.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.7,
          response_format: { type: "json_object" },
        }),
      });

      if (openaiResponse.ok) {
        const aiData = await openaiResponse.json();
        aiReasoning = JSON.parse(aiData.choices[0]?.message?.content || "{}");
      }
    } catch (aiError) {
      console.error("OpenAI error (non-critical):", aiError);
      // Continue without AI reasoning
      aiReasoning = {
        reasoning: "Pricing calculated based on cost analysis and historical performance.",
        factors: ["Material costs", "Labor rates", "Historical margins"],
        risk_assessment: "Standard risk profile",
      };
    }

    // Save pricing recommendation
    const { data: pricingRec, error: pricingError } = await supabase
      .from("pricing_recommendations")
      .upsert({
        job_id,
        team_id: job.team_id,
        recommended_price: Math.round(recommended_price * 100) / 100,
        minimum_price: Math.round(minimum_price * 100) / 100,
        high_value_price: Math.round(high_value_price * 100) / 100,
        reasoning: aiReasoning,
        material_costs: material_costs,
        labor_rates: labor_rates,
        historical_performance: {
          avg_margin: avgMargin,
          jobs_analyzed: historicalJobs?.length || 0,
        },
        season: season || null,
        complexity_score: complexity || null,
        market_conditions: {
          neighborhood_value: neighborhood_value || "standard",
        },
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "job_id",
      })
      .select()
      .single();

    if (pricingError) {
      console.error("Error saving pricing recommendation:", pricingError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        job_id,
        recommended_price: Math.round(recommended_price * 100) / 100,
        minimum_price: Math.round(minimum_price * 100) / 100,
        high_value_price: Math.round(high_value_price * 100) / 100,
        target_margin: 42, // 42% target margin
        reasoning: aiReasoning,
        cost_breakdown: {
          material: materialCost,
          labor: laborCost,
          overhead: overhead,
          total: totalCost,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating AI pricing:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});





























