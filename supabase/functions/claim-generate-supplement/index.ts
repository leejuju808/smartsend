// Block 66000 — SmartSend Insurance Claim Assistant v1
// Edge Function: Generate AI Supplement Recommendations
// Creates a pre-written supplement list with line items, justifications, code references, and photos

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
    const { job_id, scope_verification_id } = await req.json();

    if (!job_id || !scope_verification_id) {
      return new Response(
        JSON.stringify({ error: "job_id and scope_verification_id required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // 1. Fetch scope verification data
    const { data: verification, error: verificationError } = await supabase
      .from("scope_verification")
      .select("*, insurance_scopes(*)")
      .eq("id", scope_verification_id)
      .single();

    if (verificationError || !verification) {
      return new Response(
        JSON.stringify({ error: "Scope verification not found" }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // 2. Fetch job photos
    const { data: photos } = await supabase
      .from("job_photos")
      .select("*")
      .eq("job_id", job_id);

    // 3. Build AI prompt for supplement generation
    const supplementPrompt = `
You are creating a professional insurance supplement document for a roofing contractor.

Scope Verification Findings:
- Missing Items: ${JSON.stringify(verification.missing_items || [], null, 2)}
- Incorrect Items: ${JSON.stringify(verification.incorrect_items || [], null, 2)}
- Code Violations: ${JSON.stringify(verification.code_violations || [], null, 2)}
- Total Underpayment: $${verification.total_estimated_underpayment || 0}

Job Photos Available: ${photos?.length || 0} photos

Create a professional supplement document with:
1. Each missing/incorrect item formatted as a supplement line item
2. Clear justification for each item
3. Code references where applicable
4. Professional language that insurance adjusters will approve

For each item, provide:
- Line item description (professional, clear)
- Quantity and unit
- Unit price and total
- Justification (why this is needed)
- Code reference (if applicable)
- Photo references (which photos support this claim)

Return JSON in this format:
{
  "supplement_summary": "Brief professional summary explaining why supplements are needed",
  "line_items": [
    {
      "item": "Drip Edge - Eaves and Rakes",
      "quantity": 120,
      "unit": "lf",
      "unit_price": 2.50,
      "total_price": 300,
      "justification": "Code-required per IRC R905.2.8.5. Insurance scope omitted this required item. Drip edge prevents water infiltration at eaves and rakes.",
      "code_reference": "IRC R905.2.8.5",
      "photo_references": ["Photo showing eaves without drip edge"]
    }
  ],
  "total_supplement_value": 0
}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: supplementPrompt }],
      response_format: { type: "json_object" },
    });

    const supplement = JSON.parse(completion.choices[0].message.content || "{}");

    // Calculate total supplement value
    const totalValue = (supplement.line_items || []).reduce(
      (sum: number, item: any) => sum + (item.total_price || 0),
      0
    );

    // 4. Update scope_verification with recommended supplements
    const { error: updateError } = await supabase
      .from("scope_verification")
      .update({
        recommended_supplements: supplement.line_items || [],
      })
      .eq("id", scope_verification_id);

    if (updateError) {
      throw updateError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        supplement_summary: supplement.supplement_summary || "",
        line_items: supplement.line_items || [],
        total_supplement_value: totalValue,
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
    console.error("Error generating supplement:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate supplement" }),
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




























