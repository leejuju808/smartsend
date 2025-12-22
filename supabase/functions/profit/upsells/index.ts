// Block 61000 — SmartSend Roofing "AI Profit Maximizer + Pricing Optimization Engine" v1
// Edge Function: /profit/upsells
// AI generates upsell opportunities based on job context

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

// Standard upsell catalog
const UPSELL_CATALOG = {
  shingles: {
    "Class 4 Impact Shingles": {
      revenue: 2500,
      cost: 1500,
      impact_score: 85,
      description: "Superior protection against hail and wind damage",
    },
  },
  ventilation: {
    "Ridge Vent Upgrade": {
      revenue: 800,
      cost: 400,
      impact_score: 75,
      description: "Better attic ventilation, reduces energy costs",
    },
  },
  underlayment: {
    "Synthetic Underlayment Upgrade": {
      revenue: 1200,
      cost: 600,
      impact_score: 80,
      description: "Longer-lasting protection, better warranty",
    },
  },
  warranty: {
    "Extended Warranty (25 years)": {
      revenue: 1500,
      cost: 200,
      impact_score: 90,
      description: "Peace of mind with extended coverage",
    },
  },
  gutters: {
    "Gutter Replacement": {
      revenue: 3500,
      cost: 2000,
      impact_score: 70,
      description: "Complete gutter system replacement",
    },
  },
  skylights: {
    "Skylight Installation": {
      revenue: 2000,
      cost: 1200,
      impact_score: 65,
      description: "Natural light enhancement",
    },
  },
  maintenance: {
    "Annual Maintenance Plan": {
      revenue: 500,
      cost: 100,
      impact_score: 95,
      description: "Yearly inspection and maintenance",
    },
  },
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      job_id,
      roof_type,
      neighborhood,
      shingle_selection,
      weather_profile,
      homeowner_budget_indicators = {},
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

    // Build context for AI
    const context = {
      roof_type: roof_type || "standard",
      neighborhood: neighborhood || "standard",
      shingle_selection: shingle_selection || "standard",
      weather_profile: weather_profile || "moderate",
      homeowner_budget: homeowner_budget_indicators,
    };

    // Generate AI recommendations
    const prompt = `You are a roofing sales expert. Analyze this job and recommend upsell opportunities.

Job Context:
${JSON.stringify(context, null, 2)}

Available Upsells:
${JSON.stringify(UPSELL_CATALOG, null, 2)}

Provide a JSON response with:
1. recommended_upsells - Array of upsell names that make sense for this job
2. reasoning - Why each upsell is recommended
3. priority_order - Order of presentation priority

Return ONLY valid JSON.`;

    let aiRecommendations: any = { recommended_upsells: [] };
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
              content: "You are a roofing sales expert. Always return valid JSON only.",
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
        aiRecommendations = JSON.parse(aiData.choices[0]?.message?.content || "{}");
      }
    } catch (aiError) {
      console.error("OpenAI error (non-critical):", aiError);
    }

    // Generate upsell suggestions
    const upsellSuggestions = [];
    const recommendedNames = aiRecommendations.recommended_upsells || [];

    // If AI didn't provide recommendations, use smart defaults
    const defaultUpsells = [
      "Extended Warranty (25 years)",
      "Class 4 Impact Shingles",
      "Synthetic Underlayment Upgrade",
    ];

    const upsellsToProcess = recommendedNames.length > 0
      ? recommendedNames
      : defaultUpsells;

    for (const upsellName of upsellsToProcess) {
      // Find upsell in catalog
      let upsellData = null;
      let category = "other";

      for (const [cat, items] of Object.entries(UPSELL_CATALOG)) {
        if (items[upsellName]) {
          upsellData = items[upsellName];
          category = cat;
          break;
        }
      }

      if (!upsellData) continue;

      const profit = upsellData.revenue - upsellData.cost;
      const impact_score = upsellData.impact_score;

      // Save upsell suggestion
      const { data: upsell, error: upsellError } = await supabase
        .from("upsell_suggestions")
        .insert({
          job_id,
          team_id: job.team_id,
          suggestion: upsellName,
          category,
          estimated_revenue: upsellData.revenue,
          estimated_cost: upsellData.cost,
          impact_score,
          reasoning: aiRecommendations.reasoning?.[upsellName] || upsellData.description,
          homeowner_budget_indicators,
          status: "suggested",
        })
        .select()
        .single();

      if (!upsellError && upsell) {
        upsellSuggestions.push({
          id: upsell.id,
          suggestion: upsellName,
          category,
          estimated_revenue: upsellData.revenue,
          estimated_profit: profit,
          impact_score,
          reasoning: upsell.reasoning,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        job_id,
        upsells: upsellSuggestions,
        total_potential_revenue: upsellSuggestions.reduce(
          (sum, u) => sum + u.estimated_revenue,
          0
        ),
        total_potential_profit: upsellSuggestions.reduce(
          (sum, u) => sum + u.estimated_profit,
          0
        ),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error generating upsells:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});





























