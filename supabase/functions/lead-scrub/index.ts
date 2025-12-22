// Block 34888 — SmartSend Roofing AI Lead Scrubber + Qualification Engine v1
// Edge Function: /lead-scrub
// 
// This function evaluates incoming leads and generates quality scores,
// lead types, risk flags, and enrichment data using AI.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY") || Deno.env.get("OPENAI_KEY")!;

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
    const { lead_id, lead_data, source = "import" } = await req.json().catch(() => ({}));

    if (!lead_id && !lead_data) {
      return new Response(
        JSON.stringify({ error: "Missing lead_id or lead_data" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // If lead_id provided, fetch lead data
    let lead: any = lead_data;
    if (lead_id && !lead_data) {
      const { data: leadRecord, error: leadError } = await supabase
        .from("leads")
        .select("*")
        .eq("id", lead_id)
        .single();

      if (leadError || !leadRecord) {
        return new Response(
          JSON.stringify({ error: "Lead not found" }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      lead = leadRecord;
    }

    // Log intake
    const { data: intakeLog } = await supabase
      .from("lead_intake_logs")
      .insert({
        lead_id: lead_id || lead?.id,
        raw_payload: lead,
        source,
        processing_status: "processing",
      })
      .select()
      .single();

    // Build AI prompt for lead evaluation
    const prompt = `You are an AI assistant specializing in qualifying roofing leads. Evaluate this lead and return a JSON response.

Lead Data:
${JSON.stringify(lead, null, 2)}

Evaluate the following:
1. Is this a homeowner? (homeowner, rental_tenant, unclear)
2. Do they own the property? (yes, no, unclear)
3. Is the address valid? (yes, no, unclear)
4. Is the phone number active/likely valid? (yes, no, unclear)
5. Is the roof type supported? (yes, no, unclear) 
6. Is the budget realistic? (yes, no, unclear)
7. Is this inside typical service area? (yes, no, unclear)
8. Do they show buying intent? (high, medium, low, none)
9. Are they insurance or retail? (insurance, retail, unclear)
10. Is this a duplicate? (unlikely, possible, likely)
11. Is this spam? (no, possible, likely)

Return JSON in this exact format:
{
  "score": 0-100,
  "lead_type": "hot_lead" | "warm_lead" | "cold_lead" | "emergency_lead" | "insurance_lead" | "retail_lead" | "bad_lead" | "out_of_service_area" | "rental_tenant",
  "urgency": "high" | "medium" | "low",
  "intent": "ready_to_buy" | "shopping" | "curious" | "not_interested" | "unclear",
  "risk_flags": ["flag1", "flag2"],
  "enrichment": {
    "property_size": "estimated sq ft or range",
    "home_value": "estimated value or range",
    "storm_risk": "high/medium/low based on region",
    "estimated_roof_cost": "estimated cost range",
    "address_valid": true/false,
    "homeowner_type": "owner/tenant/unclear",
    "roof_type_guess": "asphalt/slate/metal/etc based on region",
    "insurance_likely": true/false
  },
  "reasoning": "brief explanation of score and classification"
}`;

    // Call OpenAI
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
            content: "You are an expert at qualifying roofing leads. Always return valid JSON.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 800,
        temperature: 0.3,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI error:", errorText);
      
      await supabase
        .from("lead_intake_logs")
        .update({
          processing_status: "failed",
          error_message: `OpenAI API error: ${errorText}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", intakeLog?.id);

      return new Response(
        JSON.stringify({ error: "AI evaluation failed" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const openaiData = await openaiResponse.json();
    const aiContent = openaiData.choices?.[0]?.message?.content || "{}";

    // Parse AI response
    let result: any;
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = aiContent.match(/```json\s*([\s\S]*?)\s*```/) || 
                       aiContent.match(/```\s*([\s\S]*?)\s*```/) ||
                       [null, aiContent];
      result = JSON.parse(jsonMatch[1] || jsonMatch[0] || aiContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", aiContent);
      result = {
        score: 50,
        lead_type: "warm_lead",
        urgency: "medium",
        intent: "unclear",
        risk_flags: ["ai_parse_error"],
        enrichment: {},
        reasoning: "AI response parsing failed",
      };
    }

    // Store quality results
    const finalLeadId = lead_id || lead?.id;
    if (finalLeadId) {
      const { error: qualityError } = await supabase
        .from("lead_quality")
        .upsert({
          lead_id: finalLeadId,
          quality_score: Math.max(0, Math.min(100, result.score || 50)),
          lead_type: result.lead_type || "warm_lead",
          urgency: result.urgency || "medium",
          intent: result.intent || "unclear",
          risk_flags: result.risk_flags || [],
          enrichment: result.enrichment || {},
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "lead_id",
        });

      if (qualityError) {
        console.error("Failed to store quality:", qualityError);
      }

      // Update intake log
      await supabase
        .from("lead_intake_logs")
        .update({
          ai_analysis: result,
          processing_status: "completed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", intakeLog?.id);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        result: {
          score: result.score,
          lead_type: result.lead_type,
          urgency: result.urgency,
          intent: result.intent,
          risk_flags: result.risk_flags,
          enrichment: result.enrichment,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Lead scrub error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
































