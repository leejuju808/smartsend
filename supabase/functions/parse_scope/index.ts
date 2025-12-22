// Block 27640 — SmartSend Roofing Insurance Supplement Intelligence v1
// Edge Function: Parse Insurance Scope
// Analyzes insurance scope text and generates supplement recommendations

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
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  try {
    const { job_id, scope_text } = await req.json();

    if (!job_id || !scope_text) {
      return new Response(
        JSON.stringify({ error: "job_id and scope_text are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get job details to find workspace_id
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id, homeowner_name, address, carrier, claim_number")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save raw text to insurance_scopes table
    const { data: scopeRecord, error: scopeError } = await supabase
      .from("roofing_insurance_scopes")
      .insert({
        job_id,
        workspace_id: job.workspace_id,
        raw_text: scope_text,
        scope_source: "copy_paste",
      })
      .select()
      .single();

    if (scopeError) {
      console.error("Error saving scope:", scopeError);
      // Continue anyway - we can still analyze
    }

    // Build AI prompt to analyze scope
    const prompt = `You are an insurance supplement expert for roofing claims.

Analyze the following insurance scope and determine which roofing line items are missing or underpaid.

Common missing items include:
- Starter strip (code-required at eaves)
- Ridge cap (required for proper ridge ventilation)
- Ice & Water shield (required in valleys and at eaves in cold climates)
- Drip edge (code-required at eaves and rakes)
- Step flashing (required at walls and chimneys)
- Vent boots (required for pipe penetrations)
- Steep charges (for roofs with high pitch)
- Second layer tear-off (if multiple layers exist)
- Code-required items (per local building codes)
- Paint/fascia/soffit repairs (if damaged during work)
- Additional underlayment (if decking is exposed or damaged)

Return JSON with an array of items in this format:
{
  "items": [
    {
      "line_item": "Description of the missing/underpaid item",
      "reason": "Why this item should be added (code requirement, damage, manufacturer requirement, etc.)",
      "estimated_cost": <number>
    }
  ]
}

Be specific and realistic with costs. Focus on items that are commonly missed by adjusters.

Insurance Scope:
${scope_text}

Job Info:
- Homeowner: ${job.homeowner_name || "N/A"}
- Address: ${job.address || "N/A"}
- Carrier: ${job.carrier || "N/A"}
- Claim #: ${job.claim_number || "N/A"}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0].message.content;
    if (!responseText) {
      throw new Error("No response from OpenAI");
    }

    const parsed = JSON.parse(responseText);
    const items = parsed.items || [];

    // Insert supplement recommendations
    const recommendations = [];
    for (const item of items) {
      const { data: rec, error: recError } = await supabase
        .from("roofing_supplement_recommendations")
        .insert({
          job_id,
          workspace_id: job.workspace_id,
          line_item: item.line_item,
          reason: item.reason,
          estimated_cost: item.estimated_cost,
          status: "pending",
        })
        .select()
        .single();

      if (!recError && rec) {
        recommendations.push(rec);
      } else {
        console.error("Error inserting recommendation:", recError);
      }
    }

    return new Response(
      JSON.stringify({
        status: "ok",
        items: recommendations,
        scope_id: scopeRecord?.id,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Error in parse_scope:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
