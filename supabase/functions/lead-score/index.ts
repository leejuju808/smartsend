// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  try {
    const { lead } = await req.json();

    if (!lead || !lead.id) {
      return new Response(
        JSON.stringify({ error: "Missing lead data" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    let score = 0;

    // 1. Industry Match (0-30)
    const guessedIndustry = lead.guessed_industry;
    const icpIndustry = lead.icp_industry;
    const icpRelated = lead.icp_related || [];

    if (guessedIndustry && icpIndustry) {
      if (guessedIndustry === icpIndustry) {
        score += 30; // Exact ICP industry match
      } else if (Array.isArray(icpRelated) && icpRelated.includes(guessedIndustry)) {
        score += 20; // Related industry
      } else if (guessedIndustry) {
        score += 10; // Unknown industry (has industry but not ICP match)
      }
    } else if (guessedIndustry) {
      score += 10; // Has industry but no ICP configured
    } else {
      score += 0; // Not ICP or unknown
    }

    // 2. Company Size (0-20)
    const employeeCount = lead.employee_count;
    if (employeeCount !== null && employeeCount !== undefined) {
      if (employeeCount >= 5 && employeeCount <= 50) {
        score += 20; // Ideal SMB
      } else if (employeeCount > 50 && employeeCount <= 500) {
        score += 15;
      } else if (employeeCount > 500) {
        score += 10;
      } else if (employeeCount >= 1 && employeeCount < 5) {
        score += 5;
      } else {
        score += 5; // Unknown/null
      }
    } else {
      score += 5; // Unknown
    }

    // 3. Engagement Score (0-30)
    const openCount = lead.open_count || 0;
    const clickCount = lead.click_count || 0;

    if (clickCount >= 2) {
      score += 30; // Multiple clicks
    } else if (clickCount === 1) {
      score += 25; // Clicked
    } else if (openCount >= 2) {
      score += 20; // 2+ opens
    } else if (openCount >= 1) {
      score += 10; // Opened email
    }

    // 4. Intent Weight (0-20, can be negative)
    const intent = lead.intent_primary;
    if (intent === "meeting_intent") {
      score += 20;
    } else if (intent === "interested") {
      score += 15;
    } else if (intent === "neutral") {
      score += 0;
    } else if (intent === "ooo") {
      score -= 5;
    } else if (intent === "not_interested") {
      score -= 10;
    } else if (intent === "unsubscribe") {
      score -= 20;
    }

    // Ensure score is between 0 and 100
    score = Math.max(0, Math.min(100, score));

    // Update lead with calculated score
    const { error } = await supabase
      .from("leads")
      .update({ score })
      .eq("id", lead.id);

    if (error) {
      console.error("Error updating lead score:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, score }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in lead-score function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});










