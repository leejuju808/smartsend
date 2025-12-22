// Revenue Autopilot Edge Function
// AI-driven pricing optimization that analyzes org usage and suggests pricing actions

import OpenAI from "https://deno.land/x/openai@v4.24.1/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

Deno.serve(async () => {
  try {
    console.log("Starting revenue autopilot analysis...");

    // Fetch all org usage stats
    const { data: orgs, error: orgsError } = await supabase
      .from("org_usage_stats")
      .select("*");

    if (orgsError) {
      console.error("Error fetching org usage stats:", orgsError);
      return new Response(
        JSON.stringify({ ok: false, error: orgsError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!orgs || orgs.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No orgs found for analysis", analyzed: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let analyzed = 0;
    let suggestionsCreated = 0;
    let errors = 0;

    for (const org of orgs) {
      try {
        // Build AI prompt for pricing analysis
        const prompt = `
Analyze this organization's usage and suggest a pricing action:

Org MRR: $${org.mrr || 0}
Emails sent: ${org.emails_sent || 0}
Workflows run: ${org.workflows_run || 0}
Agents deployed: ${org.agents_deployed || 0}

Based on this usage data, suggest one of:
1. "keep" - Current pricing is appropriate
2. "upgrade" - Org is underutilizing features or ready for higher tier (include new_price)
3. "discount" - High-value org at risk, offer retention discount (include new_price)

Return JSON only: {"action": "keep|upgrade|discount", "reason": "brief explanation", "new_price": null or number}
`;

        // Call OpenAI for pricing suggestion
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.5,
          response_format: { type: "json_object" },
        });

        const content = completion.choices[0]?.message?.content;
        if (!content) {
          console.error(`Failed to get AI response for org ${org.org_id}`);
          errors++;
          continue;
        }

        // Parse AI response
        let suggestion;
        try {
          suggestion = JSON.parse(content);
        } catch (parseError) {
          console.error(`Failed to parse AI response for org ${org.org_id}:`, parseError);
          errors++;
          continue;
        }

        // Validate suggestion structure
        if (!suggestion.action || !["keep", "upgrade", "discount"].includes(suggestion.action)) {
          console.warn(`Invalid action from AI for org ${org.org_id}, defaulting to keep`);
          suggestion = { action: "keep", reason: "AI response invalid", new_price: null };
        }

        // Store pricing action
        const { error: insertError } = await supabase
          .from("pricing_actions")
          .insert({
            org_id: org.org_id,
            action: suggestion.action,
            reason: suggestion.reason || "AI-generated suggestion",
            new_price: suggestion.new_price || null,
            created_at: new Date().toISOString(),
          });

        if (insertError) {
          console.error(`Error inserting pricing action for org ${org.org_id}:`, insertError);
          errors++;
          continue;
        }

        suggestionsCreated++;
        analyzed++;

        console.log(
          `Org ${org.org_id}: ${suggestion.action} - ${suggestion.reason || "No reason provided"}`
        );
      } catch (error) {
        console.error(`Error processing org ${org.org_id}:`, error);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Revenue autopilot analysis complete",
        analyzed,
        suggestionsCreated,
        errors,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in revenue-autopilot:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

