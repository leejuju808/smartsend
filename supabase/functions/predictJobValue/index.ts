// Block 99000 — SmartSend Roofing
// "Job Value Prediction Engine" v1
// Edge Function: /predictJobValue
// This predicts how big the job is based on lead message, home data, market tags, etc.

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

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { lead_id, message, home_data, market_tags } = await req.json();

    if (!lead_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: lead_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch lead data if not provided
    let leadMessage = message;
    let leadHomeData = home_data;
    let leadMarketTags = market_tags || [];

    if (!leadMessage || !leadHomeData) {
      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .select("*")
        .eq("id", lead_id)
        .single();

      if (leadError || !lead) {
        return new Response(
          JSON.stringify({ error: "Lead not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Extract message from lead
      if (!leadMessage) {
        leadMessage = lead.notes || lead.subject || "";
      }

      // Extract home data from lead custom fields
      if (!leadHomeData) {
        leadHomeData = lead.custom || {};
      }

      // Extract market tags from lead custom fields or infer from location
      if (!leadMarketTags || leadMarketTags.length === 0) {
        const zipcode = lead.custom?.zipcode || lead.custom?.zip;
        if (zipcode) {
          // You could enhance this to look up market tags from a zipcode database
          leadMarketTags = [];
        }
      }
    }

    // Build prompt for OpenAI
    const prompt = `Predict job value for a roofing lead.

Input:
Lead message: ${leadMessage || "No message provided"}
Home data: ${JSON.stringify(leadHomeData || {})}
Market tags: ${leadMarketTags.join(", ") || "None"}

Rules:
- Roof replacement in USA usually ranges $12,000–$25,000.
- Leak repairs range $250–$1,500.
- Missing shingles from hail typically $1,500–$8,000.
- Insurance claims often go $12,000–$18,000.
- Full reroof jobs typically $15,000–$30,000.
- Gutter replacement typically $1,500–$4,000.
- Inspection-only jobs are typically $0 (no revenue, but may lead to work).

Analyze the lead message and home data to determine:
1. Job type (reroof, repair, inspection, gutter, etc.)
2. Estimated job value in dollars

Return ONLY valid JSON in this exact format:
{
  "job_type": "reroof|repair|inspection|gutter|other",
  "estimated_value": 0
}

Do not include any other text, explanations, or markdown formatting. Only return the JSON object.`;

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Using gpt-4o-mini instead of gpt-5.1-mini (which doesn't exist)
      messages: [
        {
          role: "system",
          content: "You are a roofing industry expert. Analyze leads and predict job values. Always return valid JSON only, no other text.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3, // Lower temperature for more consistent predictions
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0]?.message?.content || "{}";
    
    // Parse JSON response
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      // If JSON parsing fails, try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Failed to parse OpenAI response as JSON");
      }
    }

    // Validate result structure
    if (!result.job_type || typeof result.estimated_value !== "number") {
      throw new Error("Invalid response format from OpenAI");
    }

    // Ensure estimated_value is reasonable (0 to 100k)
    const estimatedValue = Math.max(0, Math.min(100000, Math.round(result.estimated_value)));

    // Save to database
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        estimated_job_value: estimatedValue,
        job_stage: "estimate_booked", // Auto-advance to estimate_booked when value is predicted
        custom: {
          ...(leadHomeData || {}),
          predicted_job_type: result.job_type,
        },
      })
      .eq("id", lead_id);

    if (updateError) {
      console.error("Error updating lead:", updateError);
      // Still return the prediction even if save fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        job_type: result.job_type,
        estimated_value: estimatedValue,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in predictJobValue:", error);
    return new Response(
      JSON.stringify({
        error: error.message || String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});


























