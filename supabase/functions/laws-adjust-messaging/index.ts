// Edge Function: /laws/adjustMessaging
// Adjusts messaging based on state-specific laws and restrictions

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { message, state_code, workspace_id } = await req.json();

    if (!message || typeof message !== "string") {
      return new Response(
        JSON.stringify({ error: "message is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!state_code || typeof state_code !== "string") {
      return new Response(
        JSON.stringify({ error: "state_code is required (2-letter code)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get state restrictions
    const { data: restrictions, error: restrictionsError } = await supabaseClient
      .from("state_restrictions")
      .select("*")
      .eq("state_code", state_code.toUpperCase())
      .single();

    if (restrictionsError && restrictionsError.code !== "PGRST116") {
      console.error("Error fetching restrictions:", restrictionsError);
    }

    // Get state rules
    const { data: stateRules, error: rulesError } = await supabaseClient
      .from("state_rules")
      .select("*")
      .eq("state_code", state_code.toUpperCase())
      .single();

    if (rulesError && rulesError.code !== "PGRST116") {
      console.error("Error fetching state rules:", rulesError);
    }

    let adjustedMessage = message;
    const violations: string[] = [];
    const replacements: Array<{ original: string; replacement: string }> = [];

    // Check compliance using database function
    const { data: complianceCheck } = await supabaseClient.rpc(
      "check_messaging_compliance",
      {
        p_state_code: state_code.toUpperCase(),
        p_message_text: message,
      }
    );

    if (complianceCheck && !complianceCheck.is_compliant) {
      violations.push(...(complianceCheck.violations || []));
      if (complianceCheck.suggested_replacement) {
        adjustedMessage = complianceCheck.suggested_replacement;
      }
    }

    // Apply specific restrictions if found
    if (restrictions) {
      const messageLower = message.toLowerCase();

      // Check prohibited phrases
      if (restrictions.prohibited_phrases && Array.isArray(restrictions.prohibited_phrases)) {
        for (const phrase of restrictions.prohibited_phrases) {
          if (messageLower.includes(phrase.toLowerCase())) {
            violations.push(`Prohibited phrase: "${phrase}"`);
            
            // Try to find compliant alternative
            if (restrictions.compliant_alternatives && restrictions.compliant_alternatives[phrase]) {
              adjustedMessage = adjustedMessage.replace(
                new RegExp(phrase, "gi"),
                restrictions.compliant_alternatives[phrase]
              );
              replacements.push({
                original: phrase,
                replacement: restrictions.compliant_alternatives[phrase],
              });
            }
          }
        }
      }

      // Check prohibited keywords
      if (restrictions.prohibited_keywords && Array.isArray(restrictions.prohibited_keywords)) {
        for (const keyword of restrictions.prohibited_keywords) {
          if (messageLower.includes(keyword.toLowerCase())) {
            violations.push(`Prohibited keyword: "${keyword}"`);
          }
        }
      }
    }

    // Apply state rule adjustments
    if (stateRules) {
      // If contractor cannot negotiate claims, filter negotiation language
      if (!stateRules.contractor_can_negotiate_claim) {
        const negotiationPatterns = [
          /we can help you negotiate/gi,
          /we'll negotiate/gi,
          /negotiating with your insurance/gi,
          /we negotiate claims/gi,
        ];

        for (const pattern of negotiationPatterns) {
          if (pattern.test(adjustedMessage)) {
            violations.push("Contractor cannot negotiate claims in this state");
            adjustedMessage = adjustedMessage.replace(
              pattern,
              "We can document the damage and help you understand your options"
            );
          }
        }
      }

      // If contractor cannot interpret policy, filter policy interpretation language
      if (!stateRules.contractor_can_interpret_policy) {
        const interpretationPatterns = [
          /your policy says/gi,
          /according to your policy/gi,
          /your policy covers/gi,
          /we interpret your policy/gi,
        ];

        for (const pattern of interpretationPatterns) {
          if (pattern.test(adjustedMessage)) {
            violations.push("Contractor cannot interpret insurance policies in this state");
            adjustedMessage = adjustedMessage.replace(
              pattern,
              "You may want to review your policy with your insurance agent"
            );
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        original_message: message,
        adjusted_message: adjustedMessage,
        is_compliant: violations.length === 0,
        violations: violations,
        replacements: replacements,
        state_code: state_code.toUpperCase(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in adjustMessaging:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});





















































