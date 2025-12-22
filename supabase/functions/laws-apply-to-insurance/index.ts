// Edge Function: /laws/applyToInsurance
// Applies state laws to insurance suggestions and logic

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
    const { state_code, insurance_suggestions, contact_id, workspace_id } = await req.json();

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
          adjusted_suggestions: insurance_suggestions || [],
          adjustments_applied: [],
          message: "No state-specific laws found, using default suggestions",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adjustedSuggestions: any[] = [];
    const adjustmentsApplied: string[] = [];
    const filteredSuggestions: string[] = [];

    // Process each suggestion
    const suggestions = Array.isArray(insurance_suggestions)
      ? insurance_suggestions
      : [];

    for (const suggestion of suggestions) {
      const suggestionText =
        typeof suggestion === "string" ? suggestion : suggestion.text || suggestion.action || "";

      // Check deductible-related suggestions
      if (laws.deductible) {
        // If deductible waiving is illegal, filter out "deductible assistance" or "waive deductible"
        if (
          laws.deductible.waiving_illegal &&
          (suggestionText.toLowerCase().includes("waive deductible") ||
            suggestionText.toLowerCase().includes("deductible assistance") ||
            suggestionText.toLowerCase().includes("we'll cover your deductible"))
        ) {
          filteredSuggestions.push(suggestionText);
          adjustmentsApplied.push(
            "Removed deductible waiving suggestion (illegal in this state)"
          );

          // Replace with compliant alternatives
          if (laws.deductible.financing_allowed) {
            adjustedSuggestions.push({
              ...(typeof suggestion === "object" ? suggestion : {}),
              text: suggestionText.replace(
                /waive deductible|deductible assistance|we'll cover your deductible/gi,
                "offer financing for deductible"
              ),
              action: "offer_deductible_financing",
              compliant: true,
            });
          } else if (laws.deductible.payment_plans_allowed) {
            adjustedSuggestions.push({
              ...(typeof suggestion === "object" ? suggestion : {}),
              text: "Ask homeowner about deductible payment plan options",
              action: "discuss_deductible_payment_plan",
              compliant: true,
            });
          }
          continue;
        }
      }

      // Check negotiation-related suggestions
      if (laws.rules?.insurance) {
        if (
          !laws.rules.insurance.can_negotiate_claim &&
          (suggestionText.toLowerCase().includes("negotiate") ||
            suggestionText.toLowerCase().includes("we'll negotiate"))
        ) {
          filteredSuggestions.push(suggestionText);
          adjustmentsApplied.push(
            "Removed claim negotiation suggestion (illegal in this state)"
          );

          // Replace with compliant alternative
          if (laws.rules.insurance.can_document_damage) {
            adjustedSuggestions.push({
              ...(typeof suggestion === "object" ? suggestion : {}),
              text: "Document damage and help homeowner understand options",
              action: "document_damage",
              compliant: true,
            });
          }
          continue;
        }
      }

      // If suggestion passed all checks, include it
      adjustedSuggestions.push({
        ...(typeof suggestion === "object" ? suggestion : { text: suggestionText }),
        compliant: true,
      });
    }

    // Apply matching law adjustments
    if (laws.matching && laws.matching.requirement_type === "full_replacement_required") {
      adjustmentsApplied.push(
        "State requires full replacement if shingles don't match - increasing replacement value estimate"
      );
    }

    // Apply code requirement adjustments
    const codeSuggestions: any[] = [];
    if (laws.code_requirements) {
      if (laws.code_requirements.ice_water_shield_valleys) {
        codeSuggestions.push({
          text: "Ice & Water Shield in valleys is required by code and payable by insurance",
          action: "suggest_code_upgrade",
          type: "code_requirement",
          compliant: true,
        });
      }
      if (laws.code_requirements.ventilation_required) {
        codeSuggestions.push({
          text: "Ventilation upgrades may be required by code",
          action: "suggest_ventilation_upgrade",
          type: "code_requirement",
          compliant: true,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        original_suggestions: suggestions,
        adjusted_suggestions: [...adjustedSuggestions, ...codeSuggestions],
        filtered_suggestions: filteredSuggestions,
        adjustments_applied: adjustmentsApplied,
        state_code: state_code.toUpperCase(),
        matching_law_impact: laws.matching?.requirement_type || null,
        code_requirements_applied: codeSuggestions.length > 0,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in applyToInsurance:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});





















































