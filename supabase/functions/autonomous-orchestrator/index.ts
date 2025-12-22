// Autonomous Orchestrator Edge Function
// Monitors org activity and recommends (or launches) automations using AI

import OpenAI from "https://deno.land/x/openai@v4.24.1/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

if (!supabaseUrl || !supabaseServiceKey || !openaiApiKey) {
  throw new Error("Missing required environment variables");
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const openai = new OpenAI({ apiKey: openaiApiKey });

Deno.serve(async () => {
  try {
    // Fetch all org usage stats
    const { data: orgs, error: orgsError } = await supabase
      .from("org_usage_stats")
      .select("*");

    if (orgsError) {
      console.error("Error fetching org usage stats:", orgsError);
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to fetch org stats" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!orgs || orgs.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No orgs to process", processed: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    const suggestions = [];

    // Process each org
    for (const org of orgs) {
      try {
        // Get recent memory/context
        const memory = (org.memory || {}) as any;
        const memorySummary = memory.notes ? memory.notes.join("\n") : "";

        // Build prompt with org metrics and memory
        const prompt = `You are an AI orchestrator analyzing organization usage data.

Org Metrics:
${JSON.stringify({
  emails_sent: org.emails_sent || 0,
  workflows_run: org.workflows_run || 0,
  agents_deployed: org.agents_deployed || 0,
  mrr: org.mrr || 0,
  last_updated: org.last_updated,
})}

Previous Context:
${memorySummary || "No previous context."}

Based on this data, decide which automation or campaign should run next. Consider:
- If emails_sent is high but workflows_run is low → suggest workflow automation
- If workflows_run is high but agents_deployed is low → suggest deploying an agent
- If all metrics are low → suggest launching a campaign to increase engagement
- Build on previous recommendations from the memory context

Return ONLY valid JSON with this exact structure:
{
  "action": "trigger_workflow" | "launch_campaign" | "deploy_agent",
  "target": "specific name or identifier for the action",
  "confidence": number between 0 and 1,
  "reason": "brief explanation"
}`;

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
        });

        const content = response.choices[0].message?.content?.trim();
        if (!content) {
          console.error(`No response from OpenAI for org ${org.org_id}`);
          continue;
        }

        // Parse JSON response
        let suggestion;
        try {
          suggestion = JSON.parse(content);
        } catch (e) {
          // Try to extract JSON from markdown code blocks
          const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
          if (jsonMatch) {
            suggestion = JSON.parse(jsonMatch[1]);
          } else {
            console.error(`Failed to parse response for org ${org.org_id}:`, content);
            continue;
          }
        }

        // Validate suggestion structure
        if (
          !suggestion.action ||
          !["trigger_workflow", "launch_campaign", "deploy_agent"].includes(suggestion.action) ||
          !suggestion.target ||
          typeof suggestion.confidence !== "number" ||
          suggestion.confidence < 0 ||
          suggestion.confidence > 1
        ) {
          console.error(`Invalid suggestion structure for org ${org.org_id}:`, suggestion);
          continue;
        }

        // Insert autonomous action
        const { data: inserted, error: insertError } = await supabase
          .from("autonomous_actions")
          .insert({
            org_id: org.org_id,
            action: suggestion.action,
            target: suggestion.target,
            confidence: suggestion.confidence,
            executed: false,
          })
          .select()
          .single();

        if (insertError) {
          console.error(`Error inserting action for org ${org.org_id}:`, insertError);
          continue;
        }

        suggestions.push({
          org_id: org.org_id,
          action_id: inserted.id,
          action: suggestion.action,
          target: suggestion.target,
          confidence: suggestion.confidence,
          reason: suggestion.reason || "",
        });

        // Update memory with summary note
        const notes = memory.notes || [];
        notes.push(
          `${new Date().toISOString()}: Suggested ${suggestion.action} → ${suggestion.target} (confidence: ${(suggestion.confidence * 100).toFixed(0)}%). Reason: ${suggestion.reason || "Based on usage patterns"}`
        );

        // Keep only last 10 notes
        const recentNotes = notes.slice(-10);

        await supabase
          .from("org_usage_stats")
          .update({
            memory: {
              ...memory,
              notes: recentNotes,
              last_orchestration: new Date().toISOString(),
            },
          })
          .eq("org_id", org.org_id);

        console.log(`Created suggestion for org ${org.org_id}: ${suggestion.action} → ${suggestion.target}`);
      } catch (error) {
        console.error(`Error processing org ${org.org_id}:`, error);
        continue;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: "AI orchestration complete",
        orgs_processed: orgs.length,
        suggestions_created: suggestions.length,
        suggestions,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in autonomous-orchestrator:", error);
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

