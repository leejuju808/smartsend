// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "npm:openai@4";

const supabaseClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  try {
    const { workspace_id } = await req.json();

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "workspace_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch deliverability data using RPC
    const { data: details, error: rpcError } = await supabaseClient.rpc(
      "get_workspace_deliverability",
      { workspace: workspace_id }
    );

    if (rpcError) {
      console.error("RPC error:", rpcError);
      return new Response(
        JSON.stringify({ error: rpcError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const client = new OpenAI({ apiKey: openaiApiKey });

    const prompt = `You are an expert deliverability consultant hired to audit a cold email operation.

Analyze this SmartSend workspace:

${JSON.stringify(details, null, 2)}

Your job:

1. Give an overall deliverability score (0–100)
2. Summarize the 5 biggest risks
3. Explain what's causing them
4. Give exact, actionable fixes (step-by-step)
5. Suggest optimal sending windows
6. Suggest warmup improvements
7. Suggest domain and DNS fixes
8. Suggest campaign pacing improvements
9. Keep tone: direct, professional, no fluff

Output JSON:

{
  "score": number,
  "summary": string,
  "warnings": [string],
  "fixes": [string],
  "recommended_window": {
    "days": [...],
    "start": "HH:MM",
    "end": "HH:MM"
  },
  "warmup_recommendations": [string],
  "dns_fixes": [string],
  "campaign_fixes": [string]
}`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return new Response(
        JSON.stringify({ error: "No response from OpenAI" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Parse JSON response
    let auditResult;
    try {
      auditResult = JSON.parse(content);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response", raw: content }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(auditResult), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in deliverability-coach:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

