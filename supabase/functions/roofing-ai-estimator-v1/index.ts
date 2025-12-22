// Block 20490 — SmartSend Roofing AI Estimator v1
// Instant Price Generator From Roof Scope + Market Rates + Insurance Data
//
// This function generates instant roofing estimates automatically when:
// - Block 20380 successfully parsed a roof_scope
// - AND either:
//   - Homeowner asks for a quote
//   - Claim status = "Approved" but no contractor estimate submitted
//   - Contractor clicks "Generate Estimate" button
//
// SmartSend generates:
// - Price per square breakdown
// - Total RCV-style contractor estimate
// - Supplement recommendations
// - Optional "better roof upgrade" pricing

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EstimateRequest {
  thread_id: string;
  workspace_id?: string;
  trigger_reason?: "parsed_scope" | "homeowner_request" | "manual_generate" | "claim_approved";
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { thread_id, workspace_id, trigger_reason } = await req.json() as EstimateRequest;

    if (!thread_id) {
      return new Response(
        JSON.stringify({ error: "thread_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get thread with parsed scope data
    const { data: thread, error: threadError } = await supabaseClient
      .from("inbox_threads")
      .select(`
        id,
        workspace_id,
        contact_id,
        roof_scope,
        claim_financials,
        profitability_signals,
        has_parsed_scope,
        contacts:contact_id (
          zip_code,
          city,
          state
        )
      `)
      .eq("id", thread_id)
      .single();

    if (threadError || !thread) {
      return new Response(
        JSON.stringify({ error: "Thread not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if roof scope is parsed
    if (!thread.has_parsed_scope || !thread.roof_scope || Object.keys(thread.roof_scope).length === 0) {
      return new Response(
        JSON.stringify({ 
          error: "No parsed roof scope found. Please ensure Block 20380 has parsed the scope first.",
          requires_parsing: true
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const effective_workspace_id = workspace_id || thread.workspace_id;
    const zip_code = thread.contacts?.zip_code || null;

    // Get roof scope and financials
    const roof_scope = thread.roof_scope as Record<string, any>;
    const claim_financials = (thread.claim_financials || {}) as Record<string, any>;
    const profitability_signals = (thread.profitability_signals || {}) as Record<string, any>;

    // Calculate estimate using database function
    const { data: estimateData, error: calcError } = await supabaseClient.rpc(
      "calculate_roof_estimate",
      {
        p_thread_id: thread_id,
        p_workspace_id: effective_workspace_id,
        p_roof_scope: roof_scope,
        p_claim_financials: claim_financials,
        p_profitability_signals: profitability_signals,
        p_zip_code: zip_code,
      }
    );

    if (calcError) {
      console.error("Estimate calculation error:", calcError);
      return new Response(
        JSON.stringify({ error: "Failed to calculate estimate", details: calcError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const estimate = estimateData?.roof_estimate;
    const insurance_comparison = estimateData?.insurance_comparison;
    const supplements = estimateData?.supplements;

    if (!estimate) {
      return new Response(
        JSON.stringify({ error: "Failed to generate estimate" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Save estimate to database
    const { data: savedEstimate, error: saveError } = await supabaseClient
      .from("roof_estimates")
      .insert({
        thread_id: thread_id,
        workspace_id: effective_workspace_id,
        contact_id: thread.contact_id,
        base_rate_per_sq: estimate.base_rate_per_sq,
        squares: estimate.squares,
        steep_charge: estimate.steep_charge || 0,
        two_story_charge: estimate.two_story_charge || 0,
        ice_and_water: estimate.ice_and_water || 0,
        ridge_vent_rate: estimate.ridge_vent_rate || 0,
        calculated_total: estimate.calculated_total,
        profit_margin: estimate.profit_margin,
        final_bid_price: estimate.final_bid_price,
        insurance_rcv: insurance_comparison?.insurance_rcv,
        insurance_acv: claim_financials.acv_total,
        insurance_deductible: claim_financials.deductible,
        insurance_depreciation: claim_financials.depreciation_total,
        insurance_o_and_p_included: profitability_signals.o_and_p_included || false,
        missing_items_supplements: supplements?.missing_items_supplements || [],
        supplement_value_estimate: supplements?.supplement_value_estimate || 0,
        pricing_source: estimateData?.pricing_source || "national_default",
        zip_code: zip_code,
        status: "draft",
        generated_by: "ai_estimator_v1",
        generation_metadata: {
          trigger_reason: trigger_reason || "manual_generate",
          calculated_at: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (saveError) {
      console.error("Error saving estimate:", saveError);
      // Continue even if save fails - return the calculated estimate
    }

    // Save line items
    if (savedEstimate && estimate.line_items && Array.isArray(estimate.line_items)) {
      const lineItemsToInsert = estimate.line_items.map((item: any, index: number) => ({
        roof_estimate_id: savedEstimate.id,
        line_number: item.line_number || index + 1,
        description: item.description,
        category: item.category || "other",
        quantity: item.quantity || 1.0,
        unit: item.unit || "each",
        unit_price: item.unit_price,
        cost: item.cost,
        is_code_required: item.is_code_required || false,
        is_supplement: item.is_supplement || false,
        notes: item.notes || null,
      }));

      const { error: lineItemsError } = await supabaseClient
        .from("roof_estimate_line_items")
        .insert(lineItemsToInsert);

      if (lineItemsError) {
        console.error("Error saving line items:", lineItemsError);
      }
    }

    // Generate estimate document text (MVP version)
    const estimateDocument = generateEstimateDocument(
      estimate,
      insurance_comparison,
      supplements,
      thread.contacts
    );

    return new Response(
      JSON.stringify({
        success: true,
        estimate: {
          ...estimate,
          insurance_comparison,
          supplements,
          estimate_document: estimateDocument,
          saved_estimate_id: savedEstimate?.id,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in roofing-ai-estimator-v1:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

// Generate estimate document text (MVP version)
function generateEstimateDocument(
  estimate: any,
  insurance_comparison: any,
  supplements: any,
  contact: any
): string {
  const contactName = contact
    ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || "Customer"
    : "Customer";

  let doc = `Roof Replacement Estimate\n`;
  doc += `Prepared for ${contactName}\n\n`;
  doc += `Scope Summary\n`;
  doc += `Roof size: ${estimate.squares} SQ\n`;
  doc += `Material: Architectural Shingles\n`;
  
  if (estimate.two_story_charge > 0) {
    doc += `Stories: 2\n`;
  }
  
  if (estimate.steep_charge > 0) {
    doc += `Pitch: Steep\n`;
  }
  
  doc += `\nPrice Breakdown\n\n`;
  
  // Base installation
  doc += `Base installation (${estimate.base_rate_per_sq} × ${estimate.squares}) → $${estimate.base_rate_per_sq * estimate.squares}\n`;
  
  // Steep charge
  if (estimate.steep_charge > 0) {
    doc += `Steep charge (${estimate.steep_charge / estimate.squares} × ${estimate.squares}) → $${estimate.steep_charge}\n`;
  }
  
  // 2-story charge
  if (estimate.two_story_charge > 0) {
    doc += `2-story access (${estimate.two_story_charge / estimate.squares} × ${estimate.squares}) → $${estimate.two_story_charge}\n`;
  }
  
  // Ice & water
  if (estimate.ice_and_water > 0) {
    doc += `Ice & water shield → $${estimate.ice_and_water}\n`;
  }
  
  // Ridge vent
  if (estimate.ridge_vent_rate > 0) {
    doc += `Ridge vent → $${estimate.ridge_vent_rate}\n`;
  }
  
  doc += `\nEstimated Total: $${estimate.calculated_total}\n`;
  doc += `Including Profit Margin (${estimate.profit_margin}%): $${estimate.final_bid_price}\n`;
  
  // Insurance comparison
  if (insurance_comparison?.insurance_rcv) {
    doc += `\nInsurance Comparison\n\n`;
    doc += `Insurance RCV: $${insurance_comparison.insurance_rcv}\n`;
    doc += `Contractor Estimate: $${estimate.final_bid_price}\n`;
    
    if (supplements?.supplement_value_estimate > 0) {
      doc += `Supplement Opportunity: Yes – $${supplements.supplement_value_estimate}+ expected\n`;
    }
    
    doc += `\nSmartSend Recommendation:\n`;
    doc += `Submit this estimate to the adjuster today and schedule the homeowner by the end of the week.\n`;
  }
  
  return doc;
}
















































