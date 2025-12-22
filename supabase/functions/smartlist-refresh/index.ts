// Block 178 — AI SmartLists Refresh Engine
// Daily or manually triggered function that rewrites SmartList rules using LLM

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

Deno.serve(async (req) => {
  try {
    // Load all SmartLists
    const { data: lists, error: listsError } = await supabase
      .from("shared_resources")
      .select("*")
      .eq("smart", true)
      .eq("kind", "saved_view");

    if (listsError) {
      console.error("Error loading SmartLists:", listsError);
      return new Response(
        JSON.stringify({ error: listsError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!lists || lists.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: "No SmartLists found" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    let errors = 0;

    for (const list of lists) {
      try {
        if (!list.llm_prompt) {
          console.warn(`SmartList ${list.id} has no llm_prompt, skipping`);
          continue;
        }

        // Build prompt for LLM
        const prompt = `
You are SmartSend AI. Take this user intent:

"${list.llm_prompt}"

And generate updated filtering logic in JSON format. The rules should optimize for the highest-converting subset of leads.

Return ONLY a JSON object with this structure:
{
  "rules": [
    {"field": "lead.status", "operator": "=", "value": "engaged"},
    {"field": "company.intent_score", "operator": ">=", "value": 4},
    ...
  ]
}

Available fields:
- Lead fields: email, first_name, last_name, status, tags, created_at, updated_at
- Company fields (use "company." prefix): domain, industry, size, intent_score, engagement_score, tech_stack
- Engagement fields: last_contact_at, reply_count, open_count, click_count

Available operators: =, !=, >, >=, <, <=, contains, not_contains, in, not_in, is_null, not_null

Use only fields available in SmartSend's segment builder. Optimize for the highest-converting subset based on:
- Lead behavior
- Company intent signals
- Reply patterns
- Tech stack matches
- Engagement metrics
- Nudge success/failure
- Follow-up outcomes
- Bounce/unsubscribe patterns
`;

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "You output JSON only. No markdown, no code blocks, just valid JSON." },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          response_format: { type: "json_object" },
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error("No response from OpenAI");
        }

        // Parse JSON response
        const json = JSON.parse(content);
        
        if (!json.rules || !Array.isArray(json.rules)) {
          throw new Error("Invalid response format: missing rules array");
        }

        // Convert rules to SegmentRuleNode format
        // The LLM returns simple rules, we need to convert them to the tree structure
        const normalizedRules = normalizeLLMRules(json.rules);

        // Update SmartList with new rules
        const { error: updateError } = await supabase
          .from("shared_resources")
          .update({
            llm_rules: normalizedRules,
            last_refreshed: new Date().toISOString(),
          })
          .eq("id", list.id);

        if (updateError) {
          throw new Error(`Failed to update SmartList: ${updateError.message}`);
        }

        // Log to activity_log
        try {
          const account_id = list.account_id || list.workspace_id || list.org_id;
          if (account_id) {
            await supabase.from("activity_log").insert({
              account_id,
              event_type: "smartlist_refresh",
              meta: { smartlist_id: list.id, rules_count: normalizedRules?.length || 0 },
            });
          }
        } catch (activityErr) {
          console.error("Failed to log SmartList refresh activity:", activityErr);
        }

        processed++;
      } catch (error: any) {
        console.error(`Error processing SmartList ${list.id}:`, error);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        processed, 
        errors,
        total: lists.length 
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in smartlist-refresh:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

/**
 * Convert LLM-generated rules to SegmentRuleNode format
 */
function normalizeLLMRules(rules: any[]): any {
  if (!rules || rules.length === 0) {
    return null;
  }

  // Map operator names
  const operatorMap: Record<string, string> = {
    "=": "eq",
    "!=": "neq",
    ">": "gt",
    ">=": "gte",
    "<": "lt",
    "<=": "lte",
    "contains": "contains",
    "not_contains": "not_contains",
    "in": "in",
    "not_in": "not_in",
    "is_null": "is_null",
    "not_null": "not_null",
  };

  // Convert flat rules to SegmentRuleNode format
  const conditions = rules.map((rule: any, idx: number) => ({
    type: "condition",
    id: `cond-${idx}`,
    field: rule.field || rule.field_name,
    op: operatorMap[rule.operator || rule.op] || "eq",
    value: rule.value,
  }));

  // If only one condition, return it directly
  if (conditions.length === 1) {
    return conditions[0];
  }

  // Otherwise, wrap in AND group
  return {
    type: "group",
    id: "root",
    mode: "AND",
    children: conditions,
  };
}

