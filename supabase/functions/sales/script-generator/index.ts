// Block 59000 — SmartSend Roofing "AI Sales Coach + Objection Handling System" v1
// Edge Function: AI Sales Script Generator
// Generates sales scripts for various scenarios

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import OpenAI from "npm:openai";
import { createClient } from "jsr:@supabase/supabase-js@2";

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

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
      script_type, // 'pitch', 'door_knocking', 'insurance', 'storm_damage', 'upsell', 'voicemail', 'proposal_walkthrough'
      workspace_id,
      user_id,
      title,
      use_case,
      custom_requirements,
    } = await req.json();

    if (!script_type || !workspace_id) {
      return new Response(
        JSON.stringify({ error: "script_type and workspace_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build AI prompt for script generation
    const scriptTypeDescriptions: Record<string, string> = {
      pitch: "A general sales pitch script for presenting roofing services to homeowners",
      door_knocking: "A door-knocking script for canvassing neighborhoods (especially after storms)",
      insurance: "A script for discussing insurance coverage and the claims process",
      storm_damage: "A script for approaching homeowners after storm damage",
      upsell: "A script for upselling additional services (gutters, siding, etc.)",
      voicemail: "A voicemail script for leaving professional messages",
      proposal_walkthrough: "A script for walking through a proposal with a homeowner",
    };

    const prompt = `You are SmartSend AI — an expert roofing sales script writer.

Generate a professional, effective sales script for a roofing contractor.

SCRIPT TYPE: ${script_type}
${scriptTypeDescriptions[script_type] || "A general sales script"}

${title ? `TITLE: ${title}` : ""}
${use_case ? `USE CASE: ${use_case}` : ""}
${custom_requirements ? `CUSTOM REQUIREMENTS: ${custom_requirements}` : ""}

RULES:
- Make it conversational and natural, not robotic
- Include key talking points and value propositions
- Address common objections naturally
- Include specific examples and social proof where appropriate
- Keep it concise but comprehensive
- Use roofing industry terminology correctly
- Focus on building trust and removing risk
- Include a clear call-to-action

SCRIPT STRUCTURE:
1. Opening/Greeting
2. Value proposition
3. Key points/benefits
4. Objection handling (if applicable)
5. Call-to-action
6. Closing

Return ONLY valid JSON in this exact format:
{
  "script_content": "Full script text here...",
  "key_points": ["Point 1", "Point 2", "Point 3"],
  "use_case": "When and how to use this script"
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are SmartSend AI, an expert sales script writer. Always return valid JSON with the exact fields specified.",
        },
        { role: "user", content: prompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response", raw }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save script to database
    const { data: scriptRecord, error: dbError } = await supabase
      .from("sales_scripts")
      .insert({
        workspace_id,
        script_type,
        title: title || `${script_type} script`,
        script_content: parsed.script_content || "",
        use_case: parsed.use_case || use_case || "",
        key_points: parsed.key_points || [],
        created_by: user_id || null,
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      // Still return the AI response even if DB save fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        script_id: scriptRecord?.id || null,
        script_content: parsed.script_content || "",
        key_points: parsed.key_points || [],
        use_case: parsed.use_case || "",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
































