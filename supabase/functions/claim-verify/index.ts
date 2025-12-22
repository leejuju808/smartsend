// Block 66000 — SmartSend Insurance Claim Assistant v1
// Edge Function: Verify Insurance Scope vs. Actual Job Requirements
// Compares insurance scope to SmartSend's predicted scope
// Detects missing items, finds underpayments, flags code issues

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
    const { job_id, insurance_scope_id } = await req.json();

    if (!job_id || !insurance_scope_id) {
      return new Response(
        JSON.stringify({ error: "job_id and insurance_scope_id required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // 1. Fetch insurance scope
    const { data: scope, error: scopeError } = await supabase
      .from("insurance_scopes")
      .select("*")
      .eq("id", insurance_scope_id)
      .single();

    if (scopeError || !scope) {
      return new Response(
        JSON.stringify({ error: "Insurance scope not found" }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // 2. Fetch job data
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("*, leads(*)")
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

    // 3. Fetch job photos
    const { data: photos } = await supabase
      .from("job_photos")
      .select("*")
      .eq("job_id", job_id);

    // 4. Fetch measurement data if available
    let measurementData = null;
    const { data: measurements } = await supabase
      .from("roof_measurement_data")
      .select("*")
      .eq("job_id", job_id)
      .limit(1)
      .single();
    if (measurements) {
      measurementData = measurements;
    }

    // 5. Build AI prompt for scope verification
    const verificationPrompt = `
You are an expert roofing insurance claim analyst. Your job is to compare the insurance scope against what SHOULD be included for this roof job.

Insurance Scope Line Items:
${JSON.stringify(scope.extracted_data?.line_items || [], null, 2)}

Job Information:
- Job ID: ${job_id}
- Contract Value: ${job.contract_value || "N/A"}
- Insurance: ${job.insurance ? "Yes" : "No"}
- Notes: ${job.notes || "N/A"}

Measurement Data:
${measurementData ? JSON.stringify(measurementData, null, 2) : "No measurement data available"}

Photos Available: ${photos?.length || 0} photos

Common items that insurance scopes often MISS:
1. Drip edge (code-required at eaves and rakes)
2. Starter strip (code-required at eaves)
3. Ridge cap (required for proper ridge ventilation)
4. Ice & water shield (required in valleys and at eaves in cold climates)
5. Step flashing (required at walls and chimneys)
6. Vent boots (required for pipe penetrations)
7. Paint/fascia/soffit repairs (if damaged during work)
8. Additional underlayment (if decking is exposed or damaged)
9. Decking replacement (if damaged)
10. Steep charge (if pitch > 8/12)
11. High-pitch charge (if pitch > 10/12)
12. Waste factor corrections
13. Code upgrades (required by local building codes)

Analyze the insurance scope and identify:
1. Missing items (items that should be included but aren't)
2. Incorrect quantities (items with wrong quantities)
3. Code violations (missing code-required items)
4. Underpayments (items priced below market rate)

For each issue, provide:
- Item description
- Quantity needed
- Unit (sq, lf, ea)
- Estimated unit price
- Reason (damage, code requirement, etc.)
- Code reference (if applicable, e.g., "IRC R905.2.7.1")

Return JSON in this format:
{
  "missing_items": [
    {
      "item": "Drip Edge",
      "quantity": 120,
      "unit": "lf",
      "unit_price": 2.50,
      "total_price": 300,
      "reason": "Code-required at eaves and rakes per IRC R905.2.8.5",
      "code_reference": "IRC R905.2.8.5"
    }
  ],
  "incorrect_items": [
    {
      "item": "Architectural Shingles",
      "insurance_qty": 25,
      "actual_qty": 28,
      "unit": "sq",
      "difference": 3,
      "unit_price": 120,
      "impact": 360,
      "reason": "Insurance scope under-calculated roof area"
    }
  ],
  "code_violations": [
    {
      "item": "Ice & Water Shield",
      "code_section": "IRC R905.2.7.1",
      "requirement": "Required in valleys and at eaves in cold climates",
      "impact": 450,
      "reason": "Local code requires ice & water shield in valleys"
    }
  ],
  "total_estimated_underpayment": 0,
  "ai_summary": "Brief summary of findings"
}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: verificationPrompt }],
      response_format: { type: "json_object" },
    });

    const verification = JSON.parse(completion.choices[0].message.content || "{}");

    // Calculate total underpayment
    const missingValue = (verification.missing_items || []).reduce(
      (sum: number, item: any) => sum + (item.total_price || 0),
      0
    );
    const incorrectValue = (verification.incorrect_items || []).reduce(
      (sum: number, item: any) => sum + (item.impact || 0),
      0
    );
    const codeValue = (verification.code_violations || []).reduce(
      (sum: number, item: any) => sum + (item.impact || 0),
      0
    );
    const totalUnderpayment = missingValue + incorrectValue + codeValue;

    // 6. Create or update scope_verification record
    const { data: existing } = await supabase
      .from("scope_verification")
      .select("id")
      .eq("job_id", job_id)
      .eq("insurance_scope_id", insurance_scope_id)
      .single();

    let verificationId;

    if (existing) {
      const { data: updated, error: updateError } = await supabase
        .from("scope_verification")
        .update({
          missing_items: verification.missing_items || [],
          incorrect_items: verification.incorrect_items || [],
          code_violations: verification.code_violations || [],
          total_estimated_underpayment: totalUnderpayment,
          missing_items_value: missingValue,
          incorrect_items_value: incorrectValue,
          code_upgrade_value: codeValue,
          ai_summary: verification.ai_summary || "",
          verification_status: "completed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }
      verificationId = updated.id;
    } else {
      const { data: created, error: createError } = await supabase
        .from("scope_verification")
        .insert({
          job_id,
          workspace_id: scope.workspace_id,
          insurance_scope_id,
          missing_items: verification.missing_items || [],
          incorrect_items: verification.incorrect_items || [],
          code_violations: verification.code_violations || [],
          total_estimated_underpayment: totalUnderpayment,
          missing_items_value: missingValue,
          incorrect_items_value: incorrectValue,
          code_upgrade_value: codeValue,
          ai_summary: verification.ai_summary || "",
          verification_status: "completed",
        })
        .select()
        .single();

      if (createError) {
        throw createError;
      }
      verificationId = created.id;
    }

    return new Response(
      JSON.stringify({
        success: true,
        verification_id: verificationId,
        missing_items: verification.missing_items || [],
        incorrect_items: verification.incorrect_items || [],
        code_violations: verification.code_violations || [],
        total_estimated_underpayment: totalUnderpayment,
        ai_summary: verification.ai_summary || "",
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
    console.error("Error verifying scope:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to verify scope" }),
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




























