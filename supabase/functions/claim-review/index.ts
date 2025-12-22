// Block 66000 — SmartSend Insurance Claim Assistant v1
// Edge Function: AI Claim Strategy Assistant
// AI explains what's wrong, what to request, and how to talk to adjuster

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

    // 2. Build AI prompt for claim strategy
    const strategyPrompt = `
You are an expert roofing insurance claim consultant helping a contractor maximize their claim payout.

Scope Verification Findings:
- Total Underpayment: $${verification.total_estimated_underpayment || 0}
- Missing Items: ${(verification.missing_items || []).length} items
- Incorrect Items: ${(verification.incorrect_items || []).length} items
- Code Violations: ${(verification.code_violations || []).length} items

Missing Items Details:
${JSON.stringify(verification.missing_items || [], null, 2)}

Incorrect Items Details:
${JSON.stringify(verification.incorrect_items || [], null, 2)}

Code Violations Details:
${JSON.stringify(verification.code_violations || [], null, 2)}

Insurance Company: ${verification.insurance_scopes?.insurance_company || "Unknown"}
Adjuster: ${verification.insurance_scopes?.adjuster_name || "Unknown"}

Provide a comprehensive claim strategy that includes:

1. **What's Wrong**: Clear explanation of what the insurance scope is missing or got wrong
2. **What to Request**: Specific items to request in the supplement, prioritized by importance
3. **How to Talk to Adjuster**: Professional talking points and arguments to use
4. **Which Photos Matter**: Which photos to reference for each supplement item
5. **Best Arguments**: Strongest arguments for each supplement item
6. **Code References**: Specific building code sections to cite
7. **Expected Outcome**: Realistic expectation of what will be approved

Return JSON in this format:
{
  "whats_wrong": "Clear explanation of issues with the insurance scope",
  "what_to_request": [
    {
      "item": "Item name",
      "priority": "high | medium | low",
      "reason": "Why this is important",
      "expected_approval": "likely | possible | unlikely"
    }
  ],
  "talking_points": [
    "Professional talking point for adjuster conversation"
  ],
  "photo_strategy": {
    "item_name": ["Which photos to show for this item"]
  },
  "best_arguments": [
    {
      "item": "Item name",
      "argument": "Strong argument for this item",
      "code_reference": "Code section if applicable"
    }
  ],
  "expected_outcome": "Realistic assessment of supplement approval likelihood and expected recovery amount"
}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: strategyPrompt }],
      response_format: { type: "json_object" },
    });

    const strategy = JSON.parse(completion.choices[0].message.content || "{}");

    return new Response(
      JSON.stringify({
        success: true,
        strategy: {
          whats_wrong: strategy.whats_wrong || "",
          what_to_request: strategy.what_to_request || [],
          talking_points: strategy.talking_points || [],
          photo_strategy: strategy.photo_strategy || {},
          best_arguments: strategy.best_arguments || [],
          expected_outcome: strategy.expected_outcome || "",
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
    console.error("Error generating claim strategy:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate claim strategy" }),
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




























