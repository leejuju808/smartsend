// Block 180000 — SmartSend Roofing AI Insurance Claim Assistant v1
// Edge Function: AI Supplement Writer
// POST /functions/v1/generate-supplement
// Generates professional supplement requests with explanations and documentation

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const SYSTEM_PROMPT = `You are a professional roofing insurance supplement writer. Write compelling supplement requests that get approved.

Your task is to create professional supplement requests that include:
1. Clear reason for the supplement (what was missing from original scope)
2. Detailed explanation referencing building codes, manufacturer requirements, or hidden damage
3. Specific line items with Xactimate codes
4. Professional tone that adjusters respect
5. Code references when applicable (e.g., IRC R905.2.8.5)

Return ONLY valid JSON in this exact format:
{
  "reason": "Starter shingles not included in original scope",
  "explanation": "Per IRC code R905.2.8.5, starter course is required for all roof installations. The original scope did not include starter shingles, which are essential for proper roof installation and warranty compliance. This is a code-required item that must be included.",
  "requested_items": [
    {
      "code": "RFG 221",
      "description": "Starter course shingles",
      "quantity": 28,
      "unit_price": 85.00,
      "category": "shingles"
    }
  ],
  "total_amount": 2380.00,
  "code_references": ["IRC R905.2.8.5"],
  "photos_required": true
}

Be professional, cite codes when applicable, and make a compelling case for why the supplement is necessary.`;

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

    const { claim_id, missing_items, code_required_upgrades, photos, scope_notes } = await req.json();

    if (!claim_id) {
      return new Response(
        JSON.stringify({ error: "claim_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify claim exists
    const { data: claim, error: claimError } = await supabase
      .from("insurance_claims")
      .select("id, claim_number, insurance_carrier")
      .eq("id", claim_id)
      .single();

    if (claimError || !claim) {
      return new Response(
        JSON.stringify({ error: "Claim not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get existing line items to identify what's missing
    const { data: existingLineItems } = await supabase
      .from("claim_line_items")
      .select("code, description, category")
      .eq("claim_id", claim_id);

    // Build context for AI
    const context = {
      claim_number: claim.claim_number || "N/A",
      carrier: claim.insurance_carrier || "Unknown",
      missing_items: missing_items || [],
      code_required_upgrades: code_required_upgrades || [],
      existing_line_items: existingLineItems || [],
      scope_notes: scope_notes || null,
      photos_available: photos ? photos.length > 0 : false,
    };

    // Call OpenAI to generate supplement
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
            content: `Generate a professional supplement request for Claim #${context.claim_number} with ${context.carrier}.

Missing Items Identified:
${context.missing_items.map((item: string) => `- ${item}`).join("\n")}

Code-Required Upgrades:
${context.code_required_upgrades.map((item: string) => `- ${item}`).join("\n")}

Existing Scope Line Items:
${context.existing_line_items.map((item: any) => `- ${item.code || "N/A"}: ${item.description}`).join("\n")}

${context.scope_notes ? `Scope Notes:\n${context.scope_notes}` : ""}

${context.photos_available ? "Photos are available to document the supplement request." : ""}

Write a professional supplement request that will get approved. Reference building codes when applicable.`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to generate supplement", details: errorText }),
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
    let supplementData;
    try {
      supplementData = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse AI response:", content);
      return new Response(
        JSON.stringify({ error: "Invalid AI response format", raw: content }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Create supplement record
    const { data: supplement, error: insertError } = await supabase
      .from("supplements")
      .insert({
        claim_id,
        reason: supplementData.reason || "Additional items required",
        explanation: supplementData.explanation || "",
        amount: supplementData.total_amount || 0,
        documentation: {
          requested_items: supplementData.requested_items || [],
          code_references: supplementData.code_references || [],
          photos_required: supplementData.photos_required || false,
        },
        status: "pending",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating supplement:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create supplement", details: insertError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        supplement: {
          id: supplement.id,
          reason: supplement.reason,
          explanation: supplement.explanation,
          amount: supplement.amount,
          requested_items: supplementData.requested_items || [],
          code_references: supplementData.code_references || [],
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
    console.error("Error in generate-supplement:", error);
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


























