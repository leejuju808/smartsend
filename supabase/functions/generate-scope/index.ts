// Block 180000 — SmartSend Roofing AI Insurance Claim Assistant v1
// Edge Function: AI Scope Builder
// POST /functions/v1/generate-scope
// Generates Xactimate-style insurance scope from job details, photos, and damage analysis

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const SYSTEM_PROMPT = `You are a professional roofing insurance scope writer. Generate complete Xactimate-style insurance scopes for roofing claims.

Your task is to create a comprehensive scope that includes:
1. All necessary line items with Xactimate codes (RFG codes)
2. Proper quantities (squares, linear feet, each)
3. Accurate descriptions
4. Appropriate categories (shingles, labor, cleanup, disposal, flashing, underlayment, etc.)
5. Calculations for RCV, ACV, depreciation, deductible, and net claim

Standard Xactimate codes you should use:
- RFG 220: Remove & replace laminated shingles
- RFG 221: Starter course
- RFG 240: Ice & Water Shield
- RFG 295: Ridge cap
- RFG 300: Underlayment
- RFG 500: Remove & replace flashing
- RFG 900: Final cleanup & haul-off

Return ONLY valid JSON in this exact format:
{
  "line_items": [
    {
      "code": "RFG 220",
      "description": "Remove & replace laminated shingles",
      "quantity": 28,
      "unit_price": 450.00,
      "category": "shingles"
    }
  ],
  "totals": {
    "subtotal": 12500.00,
    "rcv": 12500.00,
    "acv": 8750.00,
    "depreciation": 3750.00,
    "deductible": 1000.00,
    "net_claim": 7750.00
  }
}

Be thorough and include all necessary items for a complete roof replacement.`;

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

    const { claim_id, job_details, photo_analyses, roof_size, materials, damage_type, local_codes } = await req.json();

    if (!claim_id) {
      return new Response(
        JSON.stringify({ error: "claim_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify claim exists and get details
    const { data: claim, error: claimError } = await supabase
      .from("insurance_claims")
      .select("id, job_id, deductible, rcv, acv, depreciation")
      .eq("id", claim_id)
      .single();

    if (claimError || !claim) {
      return new Response(
        JSON.stringify({ error: "Claim not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get existing photo analyses if not provided
    let analyses = photo_analyses;
    if (!analyses) {
      const { data: existingAnalyses } = await supabase
        .from("claim_photo_analyses")
        .select("recommended_line_items, est_squares, damage_types, materials")
        .eq("claim_id", claim_id);
      analyses = existingAnalyses || [];
    }

    // Get job details if not provided
    let jobInfo = job_details;
    if (!jobInfo) {
      const { data: job } = await supabase
        .from("jobs")
        .select("id, roof_type, job_type, notes")
        .eq("id", claim.job_id)
        .single();
      jobInfo = job;
    }

    // Build context for AI
    const context = {
      claim: {
        deductible: claim.deductible || 0,
        existing_rcv: claim.rcv || 0,
        existing_acv: claim.acv || 0,
      },
      job: jobInfo || {},
      roof_size: roof_size || (analyses[0]?.est_squares || null),
      materials: materials || (analyses[0]?.materials || []),
      damage_type: damage_type || (analyses[0]?.damage_types || []),
      photo_analyses: analyses,
      local_codes: local_codes || null,
    };

    // Call OpenAI to generate scope
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
            content: `Generate a complete insurance scope for this roofing claim:

Claim Details:
- Deductible: $${context.claim.deductible}
- Existing RCV: $${context.claim.existing_rcv}
- Existing ACV: $${context.claim.existing_acv}

Job Details:
${JSON.stringify(context.job, null, 2)}

Roof Information:
- Size: ${context.roof_size ? `${context.roof_size} squares` : "Unknown"}
- Materials: ${context.materials.join(", ") || "Unknown"}
- Damage Types: ${context.damage_type.join(", ") || "Unknown"}

Photo Analysis Results:
${JSON.stringify(context.photo_analyses, null, 2)}

${context.local_codes ? `Local Building Code Requirements:\n${context.local_codes}` : ""}

Generate a complete scope with all necessary line items. Include starter course, ice & water shield, underlayment, flashing, ridge caps, cleanup, and disposal as appropriate.`,
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
        JSON.stringify({ error: "Failed to generate scope", details: errorText }),
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
    let scopeData;
    try {
      scopeData = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse AI response:", content);
      return new Response(
        JSON.stringify({ error: "Invalid AI response format", raw: content }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Insert line items into database
    const lineItems = scopeData.line_items || [];
    const insertedItems = [];

    for (const item of lineItems) {
      const { data: lineItem, error: insertError } = await supabase
        .from("claim_line_items")
        .insert({
          claim_id,
          code: item.code || null,
          description: item.description || "",
          quantity: item.quantity || 0,
          unit_price: item.unit_price || 0,
          category: item.category || "other",
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error inserting line item:", insertError);
        continue;
      }

      insertedItems.push(lineItem);
    }

    // Update claim with totals
    const totals = scopeData.totals || {};
    await supabase
      .from("insurance_claims")
      .update({
        rcv: totals.rcv || 0,
        acv: totals.acv || 0,
        depreciation: totals.depreciation || 0,
        claim_status: "scope_created",
        updated_at: new Date().toISOString(),
      })
      .eq("id", claim_id);

    return new Response(
      JSON.stringify({
        success: true,
        scope: {
          line_items: insertedItems,
          totals: {
            subtotal: totals.subtotal || 0,
            rcv: totals.rcv || 0,
            acv: totals.acv || 0,
            depreciation: totals.depreciation || 0,
            deductible: totals.deductible || claim.deductible || 0,
            net_claim: totals.net_claim || 0,
          },
        },
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
    console.error("Error in generate-scope:", error);
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


























