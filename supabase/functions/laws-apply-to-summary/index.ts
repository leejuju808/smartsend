// Edge Function: /laws/applyToSummary
// Adds state rule reminders to summaries for rep training

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { state_code, summary_text, contact_id, workspace_id } = await req.json();

    if (!state_code || typeof state_code !== "string") {
      return new Response(
        JSON.stringify({ error: "state_code is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get all state laws
    const { data: laws } = await supabaseClient.rpc("get_state_laws", {
      p_state_code: state_code.toUpperCase(),
    });

    if (!laws || Object.keys(laws).length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          summary: summary_text || "",
          state_rule_reminder: null,
          message: "No state-specific laws found",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build state rule reminders
    const reminders: string[] = [];

    // Insurance rules
    if (laws.rules?.insurance) {
      if (!laws.rules.insurance.can_negotiate_claim) {
        reminders.push(
          `⚠️ Contractors cannot negotiate insurance claims in ${laws.state_name || state_code}.`
        );
      }
      if (!laws.rules.insurance.can_interpret_policy) {
        reminders.push(
          `⚠️ Contractors cannot interpret insurance policies in ${laws.state_name || state_code}.`
        );
      }
    }

    // Deductible rules
    if (laws.deductible?.waiving_illegal) {
      reminders.push(
        `⚠️ Deductible waiving is illegal in ${laws.state_name || state_code}.`
      );
    }

    // Matching laws
    if (laws.matching?.requirement_type === "full_replacement_required") {
      reminders.push(
        `ℹ️ ${laws.state_name || state_code} requires full roof replacement if shingles don't match.`
      );
    }

    // Storm rules
    if (laws.rules?.storm) {
      if (!laws.rules.storm.same_day_solicitation) {
        reminders.push(
          `⚠️ Same-day solicitation after storms is prohibited in ${laws.state_name || state_code}.`
        );
      }
      if (laws.rules.storm.claim_filing_deadline_days) {
        reminders.push(
          `ℹ️ Claims must be filed within ${laws.rules.storm.claim_filing_deadline_days} days of storm in ${laws.state_name || state_code}.`
        );
      }
    }

    // Licensing requirements
    if (laws.rules?.licensing?.requires_license) {
      reminders.push(
        `ℹ️ ${laws.state_name || state_code} requires a roofing license: ${laws.rules.licensing.license_details || laws.rules.licensing.license_type || "check state requirements"}.`
      );
    }

    // Build the enhanced summary
    let enhancedSummary = summary_text || "";

    if (reminders.length > 0) {
      const reminderSection = `
---
📋 STATE RULE REMINDER (${state_code.toUpperCase()}):
${reminders.join("\n")}
---
`;
      enhancedSummary = reminderSection + "\n\n" + enhancedSummary;
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary: enhancedSummary,
        original_summary: summary_text || "",
        state_rule_reminder: reminders.length > 0 ? reminders.join("\n") : null,
        reminders_count: reminders.length,
        state_code: state_code.toUpperCase(),
        state_name: laws.state_name || null,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in applyToSummary:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});





















































