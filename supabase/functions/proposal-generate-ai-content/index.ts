// Block 57000 — SmartSend Roofing "Sales Proposal Builder + Digital Signing System" v1
// Edge Function: /proposal/generate-ai-content
// AI writes: scope of work, materials, timeline, cleanup, warranties

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
      proposal_id,
      job_details,
      material_type,
      pitch,
      layers,
      add_ons = [],
      price,
    } = await req.json();

    if (!proposal_id || !job_details) {
      return new Response(
        JSON.stringify({ error: "proposal_id and job_details are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build AI prompt
    const prompt = `You are a professional roofing proposal writer. Create clear, professional content for a roofing proposal.

Job Details:
${JSON.stringify(job_details, null, 2)}

Material Type: ${material_type || "asphalt shingles"}
Pitch: ${pitch || "medium"}
Layers: ${layers || 1}
Add-ons: ${add_ons.join(", ") || "none"}
Price: $${price || "TBD"}

Generate the following sections in JSON format:
1. scope_of_work - Detailed description of work to be performed
2. materials_list - List of materials with descriptions
3. warranty_explanation - Clear warranty terms and coverage
4. process_explanation - Step-by-step process overview
5. cleanup_expectations - What cleanup is included
6. timeline - Estimated timeline for completion
7. final_summary - Professional closing summary

Return ONLY valid JSON with these keys.`;

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
            content: "You are a professional roofing proposal writer. Always return valid JSON only.",
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

    if (!openaiResponse.ok) {
      const error = await openaiResponse.text();
      console.error("OpenAI error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to generate AI content", details: error }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiResponse.json();
    const aiContent = JSON.parse(openaiData.choices[0].message.content);

    // Get current proposal first
    const { data: currentProposal, error: getError } = await supabase
      .from("proposals")
      .select("proposal_data")
      .eq("id", proposal_id)
      .single();

    if (getError || !currentProposal) {
      return new Response(
        JSON.stringify({ error: "Proposal not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update proposal with AI-generated content
    const { data: proposal, error: updateError } = await supabase
      .from("proposals")
      .update({
        proposal_data: {
          ...(currentProposal.proposal_data || {}),
          ai_generated_content: aiContent,
        },
        status: "generated",
      })
      .eq("id", proposal_id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating proposal:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update proposal", details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        proposal,
        ai_content: aiContent,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in proposal-generate-ai-content:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

