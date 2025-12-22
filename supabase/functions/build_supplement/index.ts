// Block 27010 — SmartSend Roofing Supplement Builder v1
// Edge Function: AI-Driven Supplement Builder
// Analyzes job data, field photos, and inspection summary to generate supplement line items

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

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const { job_id } = await req.json();

    if (!job_id) {
      return new Response(
        JSON.stringify({ error: "job_id required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // 1. Fetch job basics
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, title, inspection_summary, official_squares, insurance_notes, claim_number, workspace_id, primary_measurement_id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Try to get roof material from measurement data if available
    let roofMaterial = "unknown";
    if (job.primary_measurement_id) {
      const { data: measurement } = await supabase
        .from("roof_measurement_data")
        .select("material_type")
        .eq("id", job.primary_measurement_id)
        .single();
      if (measurement?.material_type) {
        roofMaterial = measurement.material_type;
      }
    }

    // 2. Fetch field photo damage labels
    const { data: photos } = await supabase
      .from("roofing_field_photos")
      .select("category, damage_labels, ai_summary")
      .eq("job_id", job_id);

    // 3. Build AI prompt
    const prompt = `
You are an assistant for a roofing contractor creating an INSURANCE SUPPLEMENT.

Your job is to:
- Look at the inspection summary
- Look at photo-based damage labels
- Look at basic roof info
- Suggest supplement line items that SHOULD be added to the insurance scope.

DO NOT respond with legal language.
Focus on practical, realistic items roofers often miss.

Common supplement items include:
- Drip edge (code-required at eaves and rakes)
- Starter strip (code-required at eaves)
- Ridge cap (required for proper ridge ventilation)
- Ice & water shield (required in valleys and at eaves in cold climates)
- Step flashing (required at walls and chimneys)
- Vent boots (required for pipe penetrations)
- Paint/fascia/soffit repairs (if damaged during work)
- Additional underlayment (if decking is exposed or damaged)

Job Info:
- Job name: ${job.title || "N/A"}
- Claim #: ${job.claim_number || "N/A"}
- Estimated squares: ${job.official_squares || 0}
- Roof material: ${roofMaterial}

Inspection Summary:
${job.inspection_summary || "N/A"}

Insurance Notes:
${job.insurance_notes || "N/A"}

Photos:
${JSON.stringify(photos || [])}

Return JSON in the following structure:

{
  "summary": "Short overview of why these supplements are needed.",
  "line_items": [
    {
      "code": "optional short code or blank",
      "description": "Clear description of line item",
      "quantity": 0,
      "unit": "sq | lf | ea",
      "rationale": "Why this should be added (damage, code, manufacturer requirement)."
    }
  ]
}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const body = completion.choices[0].message.content;
    if (!body) {
      throw new Error("No response from OpenAI");
    }

    const parsed = JSON.parse(body);

    // 4. Upsert supplement record
    const { data: existing } = await supabase
      .from("roofing_supplements")
      .select("*")
      .eq("job_id", job_id)
      .single();

    let supplementId = existing?.id;

    if (!supplementId) {
      const { data: created, error: createError } = await supabase
        .from("roofing_supplements")
        .insert({
          job_id,
          workspace_id: job.workspace_id,
          summary: parsed.summary,
          status: "draft",
        })
        .select("id")
        .single();

      if (createError) {
        throw createError;
      }

      supplementId = created?.id;
    } else {
      const { error: updateError } = await supabase
        .from("roofing_supplements")
        .update({ summary: parsed.summary })
        .eq("id", supplementId);

      if (updateError) {
        throw updateError;
      }
    }

    // 5. Insert line items (overwrite draft items)
    const { error: deleteError } = await supabase
      .from("roofing_supplement_line_items")
      .delete()
      .eq("supplement_id", supplementId);

    if (deleteError) {
      throw deleteError;
    }

    const items = (parsed.line_items || []).map((li: any) => ({
      supplement_id: supplementId,
      code: li.code || null,
      description: li.description,
      quantity: li.quantity || 1,
      unit: li.unit || "ea",
      rationale: li.rationale || null,
    }));

    if (items.length > 0) {
      const { error: insertError } = await supabase
        .from("roofing_supplement_line_items")
        .insert(items);

      if (insertError) {
        throw insertError;
      }
    }

    // 6. Calculate total amount (if unit_price is provided)
    let totalAmount = 0;
    if (items.some((item: any) => item.unit_price)) {
      totalAmount = items.reduce((sum: number, item: any) => {
        return sum + (item.total_price || item.unit_price * item.quantity || 0);
      }, 0);
    }

    if (totalAmount > 0) {
      await supabase
        .from("roofing_supplements")
        .update({ total_amount: totalAmount })
        .eq("id", supplementId);
    }

    return new Response(
      JSON.stringify({
        supplement_id: supplementId,
        summary: parsed.summary,
        line_items: items,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Error building supplement:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to build supplement" }),
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



































