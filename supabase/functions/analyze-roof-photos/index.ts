// Block 180000 — SmartSend Roofing AI Insurance Claim Assistant v1
// Edge Function: AI Photo Analysis for Insurance Claims
// POST /functions/v1/analyze-roof-photos
// Analyzes roof photos using OpenAI Vision to detect damage and recommend line items

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const SYSTEM_PROMPT = `You are a professional roofing insurance claim expert. Analyze roof photos to detect damage and recommend insurance line items.

Your task is to identify:
1. Damage types: missing shingles, creased shingles, hail impact marks, wind damage, soft metal damage (vents, gutters), flashing issues, ridge cap damage
2. Materials: shingle type (laminate, 3-tab, architectural), ridge shingles, underlayment type, flashing material
3. Roof characteristics: slope type (e.g., "4/12", "6/12", "8/12", "10/12", "12/12"), estimated squares (1 square = 100 sq ft)
4. Safety issues: any visible safety concerns
5. Recommended line items: Xactimate-style codes with descriptions and quantities

Return ONLY valid JSON in this exact format:
{
  "damage": ["missing shingles", "hail impacts", "ridge cap damage"],
  "materials": ["laminate shingles", "ridge shingles"],
  "est_squares": 28,
  "slope_type": "6/12",
  "roof_material": "laminate shingles",
  "safety_issues": "Steep slope - requires safety equipment",
  "recommended_line_items": [
    {
      "code": "RFG 220",
      "description": "Remove & replace laminated shingles",
      "quantity": 28,
      "category": "shingles"
    },
    {
      "code": "RFG 295",
      "description": "Replace ridge cap shingles",
      "quantity": 3,
      "category": "shingles"
    }
  ],
  "confidence": 0.85
}

Use standard Xactimate codes when possible (RFG codes for roofing). Be conservative with estimates.`;

serve(async (req) => {
  try {
    // CORS headers
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { claim_id, photo_urls } = await req.json();

    if (!claim_id || !photo_urls || !Array.isArray(photo_urls) || photo_urls.length === 0) {
      return new Response(
        JSON.stringify({ error: "claim_id and photo_urls array are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify claim exists
    const { data: claim, error: claimError } = await supabase
      .from("insurance_claims")
      .select("id, job_id")
      .eq("id", claim_id)
      .single();

    if (claimError || !claim) {
      return new Response(
        JSON.stringify({ error: "Claim not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Prepare images for OpenAI Vision API
    const imageMessages = photo_urls.map((url: string) => ({
      type: "image_url" as const,
      image_url: { url },
    }));

    // Call OpenAI Vision API
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze these roof photos for insurance claim purposes. Detect all damage, identify materials, estimate squares, and recommend line items with Xactimate codes.",
              },
              ...imageMessages,
            ],
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to analyze photos", details: errorText }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiResponse.json();
    const content = openaiData.choices[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({ error: "No response from AI" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Parse the JSON response
    let analysis;
    try {
      analysis = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse AI response:", content);
      return new Response(
        JSON.stringify({ error: "Invalid AI response format", raw: content }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Store analysis results for each photo
    const analysisResults = [];
    for (const photoUrl of photo_urls) {
      const { data: photoAnalysis, error: insertError } = await supabase
        .from("claim_photo_analyses")
        .insert({
          claim_id,
          photo_url,
          damage_types: analysis.damage || [],
          materials: analysis.materials || [],
          est_squares: analysis.est_squares || null,
          recommended_line_items: analysis.recommended_line_items || [],
          safety_issues: analysis.safety_issues || null,
          slope_type: analysis.slope_type || null,
          roof_material: analysis.roof_material || null,
          ai_model: "gpt-4o",
          confidence_score: analysis.confidence || 0.5,
          analysis_raw: analysis,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error storing photo analysis:", insertError);
        continue;
      }

      analysisResults.push(photoAnalysis);
    }

    // Aggregate recommended line items from all photos
    const aggregatedLineItems: Record<string, any> = {};
    for (const result of analysisResults) {
      const lineItems = result.recommended_line_items || [];
      for (const item of lineItems) {
        const key = `${item.code || item.description}`;
        if (aggregatedLineItems[key]) {
          aggregatedLineItems[key].quantity = Math.max(
            aggregatedLineItems[key].quantity,
            item.quantity || 0
          );
        } else {
          aggregatedLineItems[key] = {
            code: item.code || null,
            description: item.description || "",
            quantity: item.quantity || 0,
            category: item.category || "other",
          };
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        analysis: {
          damage: analysis.damage || [],
          materials: analysis.materials || [],
          est_squares: analysis.est_squares || null,
          slope_type: analysis.slope_type || null,
          roof_material: analysis.roof_material || null,
          safety_issues: analysis.safety_issues || null,
          recommended_line_items: Object.values(aggregatedLineItems),
          confidence: analysis.confidence || 0.5,
        },
        photo_analyses: analysisResults,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error: any) {
    console.error("Error in analyze-roof-photos:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
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


























