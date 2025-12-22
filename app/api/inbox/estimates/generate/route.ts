import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";
import {
  generateMaterialBrandRecommendations,
  generateUpsellRecommendations,
  generateEstimateSummary,
  generateSMSEstimate,
} from "@/src/lib/ai/estimateBuilderV2";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * POST /api/inbox/estimates/generate
 * Generate an AI-powered estimate for a thread
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { threadId, templateType } = body;

    if (!threadId) {
      return NextResponse.json(
        { error: "threadId is required" },
        { status: 400 }
      );
    }

    // Get thread with all related data
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select(`
        id,
        campaign_id,
        lead_id,
        job_type,
        job_subcategory,
        severity_level,
        thread_estimated_value,
        revenue_metadata,
        contacts:contact_id (
          id,
          workspace_id,
          zip_code,
          city,
          state
        )
      `)
      .eq("id", threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    const workspaceId = thread.contacts?.workspace_id;
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get roof measurements if available
    const { data: measurements } = await supabase
      .from("roof_measurements")
      .select("*")
      .eq("thread_id", threadId)
      .order("analyzed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get material intelligence if available
    const { data: materialIntel } = await supabase
      .from("material_intelligence")
      .select("*")
      .eq("contact_id", thread.contacts?.id)
      .maybeSingle();

    // Get messages for context
    const { data: messages } = await supabase
      .from("inbox_messages")
      .select("body_text, body_html, direction")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(10);

    // Determine template type if not provided
    let selectedTemplateType = templateType;
    if (!selectedTemplateType) {
      // Auto-select template based on job type
      if (thread.job_type === "roof_repair") {
        selectedTemplateType = thread.job_subcategory || "shingle_replacement";
      } else if (thread.job_type === "roof_replacement") {
        selectedTemplateType = "full_tear_off";
      } else {
        selectedTemplateType = "shingle_replacement"; // Default
      }
    }

    // Get template
    const { data: template } = await supabase
      .from("estimate_templates")
      .select("*")
      .eq("template_type", selectedTemplateType)
      .eq("is_active", true)
      .maybeSingle();

    // Extract key data for AI reasoning
    const roofSquares = measurements?.estimated_squares_avg || 20;
    const materialType = measurements?.material_type || materialIntel?.material_type || "asphalt";
    const shingleType = materialIntel?.shingle_type || "architectural";
    const pitchCategory = measurements?.pitch_category || "medium";
    const complexityRating = measurements?.complexity_rating || "medium";
    const zipCode = thread.contacts?.zip_code;
    const regionMultiplier = measurements?.region_pricing_multiplier || 1.0;

    // Calculate pricing using database function
    const { data: pricingData, error: pricingError } = await supabase.rpc(
      "calculate_estimate_total",
      {
        p_squares_avg: roofSquares,
        p_material_type: materialType,
        p_shingle_type: shingleType,
        p_pitch_category: pitchCategory,
        p_complexity_rating: complexityRating,
        p_region_multiplier: regionMultiplier,
        p_has_chimney: measurements?.chimneys_detected || false,
        p_has_skylights: measurements?.skylights_detected || false,
        p_cut_up_roof: measurements?.multi_plane_complexity || false,
        p_job_type: thread.job_type || "roof_replacement",
      }
    );

    if (pricingError) {
      console.error("Pricing calculation error:", pricingError);
    }

    const pricing = pricingData || {
      total_min: 5000,
      total_max: 15000,
      total_avg: 10000,
    };

    // ============================================================================
    // BLOCK 20020 CALCULATIONS
    // ============================================================================

    // PART 1: Calculate Material Quantities
    const { data: materialQuantitiesData } = await supabase.rpc(
      "calculate_material_quantities",
      {
        p_squares_avg: roofSquares,
        p_pitch_category: pitchCategory,
        p_complexity_rating: complexityRating,
        p_waste_factor_percent: 12.0, // Will be updated after waste factor calculation
        p_material_type: materialType,
        p_has_dormers: measurements?.dormers_detected || false,
        p_has_valleys: measurements?.multi_plane_complexity || false,
        p_penetrations_count: measurements?.penetrations_count || 0,
        p_ridge_length_ft: null,
      }
    );

    // PART 2: Calculate Waste Factor
    const { data: wasteFactorData } = await supabase.rpc("calculate_waste_factor", {
      p_complexity_rating: complexityRating,
      p_has_dormers: measurements?.dormers_detected || false,
      p_has_valleys: measurements?.multi_plane_complexity || false,
      p_multi_plane_complexity: measurements?.multi_plane_complexity || false,
      p_penetrations_count: measurements?.penetrations_count || 0,
      p_steep_pitch: pitchCategory === "steep" || pitchCategory === "high",
    });

    const wasteFactor = wasteFactorData || {
      waste_factor_percent: 12.0,
      waste_factor_category: "standard",
    };

    // Recalculate material quantities with correct waste factor
    const { data: materialQuantitiesFinal } = await supabase.rpc(
      "calculate_material_quantities",
      {
        p_squares_avg: roofSquares,
        p_pitch_category: pitchCategory,
        p_complexity_rating: complexityRating,
        p_waste_factor_percent: wasteFactor.waste_factor_percent,
        p_material_type: materialType,
        p_has_dormers: measurements?.dormers_detected || false,
        p_has_valleys: measurements?.multi_plane_complexity || false,
        p_penetrations_count: measurements?.penetrations_count || 0,
        p_ridge_length_ft: null,
      }
    );

    // PART 3: Calculate Labor Hours
    const { data: laborHoursData } = await supabase.rpc("calculate_labor_hours", {
      p_squares_avg: roofSquares,
      p_complexity_rating: complexityRating,
      p_material_type: materialType,
      p_pitch_category: pitchCategory,
      p_has_chimney: measurements?.chimneys_detected || false,
      p_has_skylights: measurements?.skylights_detected || false,
      p_has_dormers: measurements?.dormers_detected || false,
      p_tear_off_required: thread.job_type === "roof_replacement",
    });

    const laborHours = laborHoursData || {
      crew_size: 4,
      labor_hours_min: 20,
      labor_hours_max: 30,
      labor_hours_avg: 25,
      job_duration_days_min: 1,
      job_duration_days_max: 2,
      job_duration_days_avg: 1.5,
    };

    // PART 4: Check Permit Requirements
    const { data: permitData } = await supabase.rpc("check_permit_requirements", {
      p_state: thread.contacts?.state || null,
      p_city: thread.contacts?.city || null,
      p_zip_code: zipCode || null,
      p_job_type: thread.job_type || "roof_replacement",
      p_squares_avg: roofSquares,
      p_tear_off_required: thread.job_type === "roof_replacement",
      p_structural_concerns: false,
    });

    const permitInfo = permitData || {
      permit_required: false,
      permit_reason: "No permit required for this type of work",
      permit_cost_estimate: 0,
    };

    // PART 5: Generate Insurance Code Items
    const isInsuranceJob =
      thread.revenue_metadata?.insurance_mention ||
      thread.job_type === "insurance_driven_claim" ||
      false;

    const { data: codeItemsData } = await supabase.rpc(
      "generate_insurance_code_items",
      {
        p_is_insurance_job: isInsuranceJob,
        p_state: thread.contacts?.state || null,
        p_squares_avg: roofSquares,
        p_has_valleys: measurements?.multi_plane_complexity || false,
        p_has_chimney: measurements?.chimneys_detected || false,
      }
    );

    const codeItems = codeItemsData?.code_items || [];

    // PART 6: Generate Material Brand Recommendations
    const brandRecommendations = await generateMaterialBrandRecommendations(
      thread.contacts?.city || "Unknown",
      thread.contacts?.state || "Unknown",
      [], // Weather patterns - could be enhanced
      materialType,
      shingleType,
      roofSquares,
      "mid_range" // Default preference
    );

    // PART 7: Generate Upsell Recommendations
    const upsellRecommendations = await generateUpsellRecommendations(
      roofSquares,
      materialType,
      complexityRating,
      measurements?.chimneys_detected || false,
      measurements?.skylights_detected || false,
      measurements?.multi_plane_complexity || false,
      thread.contacts?.city || "Unknown",
      thread.contacts?.state || "Unknown",
      isInsuranceJob
    );

    // PART 8: Generate Customer Summary
    const includesItems = codeItems
      .map((item: any) => item.description)
      .slice(0, 3)
      .concat(["drip edge", "ridge vent"]);

    const customerSummary = await generateEstimateSummary(
      thread.job_type || "roof_replacement",
      measurements?.estimated_squares_min || roofSquares - 2,
      measurements?.estimated_squares_max || roofSquares + 2,
      materialType,
      laborHours.job_duration_days_min,
      laborHours.job_duration_days_max,
      pricing.total_min,
      pricing.total_max,
      includesItems,
      true
    );

    // PART 10: Generate SMS Estimate
    const smsEstimate = generateSMSEstimate(
      measurements?.estimated_squares_min || roofSquares - 2,
      measurements?.estimated_squares_max || roofSquares + 2,
      pricing.total_min,
      pricing.total_max,
      thread.job_type || "roof_replacement"
    );

    // Generate AI reasoning and line items
    const messageContext = messages
      ?.map((m) => m.body_text || m.body_html)
      .join("\n\n")
      .substring(0, 2000) || "";

    const aiPrompt = `You are a roofing estimate expert. Generate a detailed estimate breakdown for this roofing job.

Thread Context:
- Job Type: ${thread.job_type || "unknown"}
- Job Subcategory: ${thread.job_subcategory || "none"}
- Severity: ${thread.severity_level || "medium"}
- Roof Size: ${roofSquares} squares
- Material: ${materialType} (${shingleType})
- Pitch: ${pitchCategory}
- Complexity: ${complexityRating}
- Estimated Total: $${pricing.total_min.toFixed(2)} - $${pricing.total_max.toFixed(2)}

Recent Messages:
${messageContext.substring(0, 1000)}

Generate:
1. A brief explanation of how this estimate was calculated (2-3 sentences)
2. A list of line items based on the template type: ${selectedTemplateType}

Return JSON with:
{
  "reasoning": "Brief explanation...",
  "lineItems": [
    {
      "description": "Item description",
      "category": "materials|labor|removal|disposal|equipment|permits|warranty|other",
      "quantity": 1.0,
      "unit": "each|square|hour|linear_foot",
      "unit_cost": 100.00,
      "labor_cost": 0.00,
      "material_cost": 100.00,
      "total_cost": 100.00,
      "notes": "Optional notes"
    }
  ]
}`;

    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a professional roofing estimator. Generate accurate, detailed line items for roofing estimates. Always return valid JSON.",
        },
        { role: "user", content: aiPrompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    let aiData: {
      reasoning: string;
      lineItems: Array<{
        description: string;
        category: string;
        quantity: number;
        unit: string;
        unit_cost: number;
        labor_cost?: number;
        material_cost?: number;
        total_cost: number;
        notes?: string;
      }>;
    } = {
      reasoning: "Estimate generated based on roof measurements, material detection, and job complexity.",
      lineItems: [],
    };

    try {
      const content = aiResponse.choices[0]?.message?.content;
      if (content) {
        aiData = JSON.parse(content);
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
    }

    // Use template line items if AI didn't generate good ones
    if (!aiData.lineItems || aiData.lineItems.length === 0) {
      const defaultItems = template?.default_line_items || [];
      aiData.lineItems = (defaultItems as any[]).map((item, idx) => ({
        description: item.description || `Line item ${idx + 1}`,
        category: item.category || "other",
        quantity: item.quantity || 1,
        unit: item.unit || "each",
        unit_cost: item.unit_cost || 0,
        labor_cost: item.category === "labor" ? item.unit_cost * (item.quantity || 1) : 0,
        material_cost: item.category === "materials" ? item.unit_cost * (item.quantity || 1) : 0,
        total_cost: (item.unit_cost || 0) * (item.quantity || 1),
        notes: item.notes,
      }));
    }

    // Create estimate record with Block 20020 fields
    const { data: estimate, error: estimateError } = await supabase
      .from("estimates")
      .insert({
        thread_id: threadId,
        contact_id: thread.contacts?.id,
        workspace_id: workspaceId,
        campaign_id: thread.campaign_id,
        template_id: template?.id,
        template_type: selectedTemplateType,
        job_type: thread.job_type,
        job_subcategory: thread.job_subcategory,
        severity_level: thread.severity_level,
        estimated_total_min: pricing.total_min,
        estimated_total_max: pricing.total_max,
        estimated_total_avg: pricing.total_avg,
        price_range_text: `$${pricing.total_min.toFixed(0)} - $${pricing.total_max.toFixed(0)}`,
        roof_squares_min: measurements?.estimated_squares_min,
        roof_squares_max: measurements?.estimated_squares_max,
        roof_squares_avg: measurements?.estimated_squares_avg,
        pitch_estimate: measurements?.pitch_estimate,
        pitch_category: measurements?.pitch_category,
        material_type: materialType,
        shingle_type: shingleType,
        complexity_rating: complexityRating,
        steep_pitch_multiplier: pricing.pitch_multiplier || 1.0,
        difficulty_multiplier: pricing.complexity_multiplier || 1.0,
        cut_up_roof_multiplier: measurements?.multi_plane_complexity ? 1.15 : 1.0,
        flashing_complexity_multiplier: 1.0,
        chimney_add_on: pricing.chimney_add_on || 0,
        skylight_add_on: pricing.skylight_add_on || 0,
        zip_code: zipCode,
        region_pricing_multiplier: regionMultiplier,
        insurance_likelihood: thread.revenue_metadata?.insurance_mention ? "high" : "low",
        ai_reasoning: aiData.reasoning,
        ai_confidence_score: 75,
        generation_metadata: {
          measurements_id: measurements?.id,
          material_intelligence_id: materialIntel?.id,
          template_used: template?.id,
          pricing_calculation: pricing,
        },
        status: "draft",
        // Block 20020 fields
        material_quantities: materialQuantitiesFinal || {},
        waste_factor_percent: wasteFactor.waste_factor_percent,
        waste_factor_category: wasteFactor.waste_factor_category,
        estimated_crew_size: laborHours.crew_size,
        estimated_labor_hours_min: laborHours.labor_hours_min,
        estimated_labor_hours_max: laborHours.labor_hours_max,
        estimated_job_duration_days_min: laborHours.job_duration_days_min,
        estimated_job_duration_days_max: laborHours.job_duration_days_max,
        permit_required: permitInfo.permit_required,
        permit_reason: permitInfo.permit_reason,
        permit_cost_estimate: permitInfo.permit_cost_estimate,
        insurance_code_items: codeItems,
        recommended_brands: brandRecommendations,
        upsell_options: upsellRecommendations,
        customer_summary: customerSummary.summary_text,
        sms_estimate_text: smsEstimate,
      })
      .select()
      .single();

    if (estimateError) {
      console.error("Error creating estimate:", estimateError);
      return NextResponse.json(
        { error: "Failed to create estimate" },
        { status: 500 }
      );
    }

    // Create line items
    const lineItemsToInsert = aiData.lineItems.map((item, idx) => ({
      estimate_id: estimate.id,
      line_number: idx + 1,
      description: item.description,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      unit_cost: item.unit_cost,
      labor_cost: item.labor_cost || 0,
      material_cost: item.material_cost || 0,
      total_cost: item.total_cost,
      notes: item.notes,
      ai_generated: true,
    }));

    const { error: lineItemsError } = await supabase
      .from("estimate_line_items")
      .insert(lineItemsToInsert);

    if (lineItemsError) {
      console.error("Error creating line items:", lineItemsError);
    }

    // Create material quantity records
    if (materialQuantitiesFinal) {
      const materialQuantityRecords = [
        {
          estimate_id: estimate.id,
          material_type: "shingles",
          quantity_min: materialQuantitiesFinal.shingles_bundles_min,
          quantity_max: materialQuantitiesFinal.shingles_bundles_max,
          quantity_avg: materialQuantitiesFinal.shingles_bundles_avg,
          unit: "bundles",
          waste_factor_percent: wasteFactor.waste_factor_percent,
          quantity_with_waste: materialQuantitiesFinal.shingles_bundles_avg,
        },
        {
          estimate_id: estimate.id,
          material_type: "underlayment",
          quantity_min: materialQuantitiesFinal.underlayment_rolls_min,
          quantity_max: materialQuantitiesFinal.underlayment_rolls_max,
          quantity_avg: materialQuantitiesFinal.underlayment_rolls_avg,
          unit: "rolls",
          waste_factor_percent: wasteFactor.waste_factor_percent,
          quantity_with_waste: materialQuantitiesFinal.underlayment_rolls_avg,
        },
        {
          estimate_id: estimate.id,
          material_type: "ridge_cap",
          quantity_avg: materialQuantitiesFinal.ridge_cap_ft,
          unit: "linear_feet",
          waste_factor_percent: wasteFactor.waste_factor_percent,
          quantity_with_waste: materialQuantitiesFinal.ridge_cap_ft,
        },
        {
          estimate_id: estimate.id,
          material_type: "starter",
          quantity_avg: materialQuantitiesFinal.starter_ft,
          unit: "linear_feet",
          waste_factor_percent: wasteFactor.waste_factor_percent,
          quantity_with_waste: materialQuantitiesFinal.starter_ft,
        },
        {
          estimate_id: estimate.id,
          material_type: "ice_water_shield",
          quantity_avg: materialQuantitiesFinal.ice_water_shield_rolls,
          unit: "rolls",
          waste_factor_percent: 0,
          quantity_with_waste: materialQuantitiesFinal.ice_water_shield_rolls,
          is_code_required: isInsuranceJob,
        },
        {
          estimate_id: estimate.id,
          material_type: "drip_edge",
          quantity_avg: materialQuantitiesFinal.drip_edge_ft,
          unit: "linear_feet",
          waste_factor_percent: 0,
          quantity_with_waste: materialQuantitiesFinal.drip_edge_ft,
          is_code_required: true,
        },
      ].filter((item) => item.quantity_avg > 0);

      const { error: materialQuantitiesError } = await supabase
        .from("estimate_material_quantities")
        .insert(materialQuantityRecords);

      if (materialQuantitiesError) {
        console.error("Error creating material quantities:", materialQuantitiesError);
      }
    }

    // Create upsell records
    if (upsellRecommendations.length > 0) {
      const upsellRecords = upsellRecommendations.map((upsell) => ({
        estimate_id: estimate.id,
        upsell_type: upsell.upsell_type,
        title: upsell.title,
        description: upsell.description,
        cost_min: upsell.cost_min,
        cost_max: upsell.cost_max,
        cost_avg: upsell.cost_avg,
        is_recommended: upsell.is_recommended,
        ai_reasoning: upsell.ai_reasoning,
        priority: upsell.priority,
      }));

      const { error: upsellsError } = await supabase
        .from("estimate_upsells")
        .insert(upsellRecords);

      if (upsellsError) {
        console.error("Error creating upsells:", upsellsError);
      }
    }

    // Create material brand records
    if (brandRecommendations.length > 0) {
      const brandRecords = brandRecommendations.map((brand) => ({
        estimate_id: estimate.id,
        brand_name: brand.brand_name,
        brand_category: brand.brand_category,
        product_line: brand.product_line,
        warranty_years: brand.warranty_years,
        price_per_square_min: brand.price_per_square_min,
        price_per_square_max: brand.price_per_square_max,
        price_difference_percent: brand.price_difference_percent,
        pros: brand.pros,
        cons: brand.cons,
        best_for: brand.best_for,
        ai_reasoning: brand.ai_reasoning,
        recommendation_score: brand.recommendation_score,
        is_recommended: brand.is_recommended,
        region_suitability: brand.region_suitability,
        weather_patterns: brand.weather_patterns,
      }));

      const { error: brandsError } = await supabase
        .from("estimate_material_brands")
        .insert(brandRecords);

      if (brandsError) {
        console.error("Error creating brand recommendations:", brandsError);
      }
    }

    // Update thread estimated value
    await supabase
      .from("inbox_threads")
      .update({
        thread_estimated_value: pricing.total_avg,
        updated_at: new Date().toISOString(),
      })
      .eq("id", threadId);

    // Fetch complete estimate with all related data
    const { data: completeEstimate } = await supabase
      .from("estimates")
      .select(`
        *,
        estimate_line_items (*),
        estimate_material_quantities (*),
        estimate_upsells (*),
        estimate_material_brands (*)
      `)
      .eq("id", estimate.id)
      .single();

    // Block 20520: Optionally auto-generate proposal when estimate completes
    // This can be triggered by:
    // 1. Setting autoGenerateProposal: true in request body
    // 2. Insurance claim approved but homeowner undecided
    // 3. Homeowner explicitly requested proposal
    const { autoGenerateProposal } = body;
    let proposal = null;
    
    if (autoGenerateProposal) {
      try {
        // Call proposal generation endpoint internally
        const proposalResponse = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/inbox/proposals/generate`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Cookie: req.headers.get("cookie") || "",
            },
            body: JSON.stringify({
              threadId,
              estimateId: estimate.id,
            }),
          }
        );
        
        if (proposalResponse.ok) {
          const proposalData = await proposalResponse.json();
          proposal = proposalData.proposal;
        }
      } catch (error) {
        console.error("Error auto-generating proposal:", error);
        // Don't fail the estimate generation if proposal fails
      }
    }

    return NextResponse.json({
      estimate: completeEstimate,
      proposal: proposal,
      success: true,
    });
  } catch (error) {
    console.error("Error in /api/inbox/estimates/generate:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

