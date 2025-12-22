// Block 255500 — SmartSend Repair Division Engine v1
// POST /api/repairs/[id]/upsell
// Repair → Replacement Upsell Engine

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const {
      replacement_recommended,
      replacement_reason,
      insurance_evaluation_recommended,
      upsell_type, // 'replacement', 'insurance_evaluation', 'maintenance_plan'
    } = body;

    // Get repair request
    const { data: repairRequest, error: requestError } = await supabase
      .from("repair_requests")
      .select("*, customers(*)")
      .eq("id", id)
      .single();

    if (requestError || !repairRequest) {
      return NextResponse.json(
        { error: "Repair request not found" },
        { status: 404 }
      );
    }

    // Analyze for upsell opportunities using AI metadata
    const aiMetadata = repairRequest.ai_analysis_metadata || {};
    const customer = repairRequest.customers || {};

    let upsellRecommendations: any[] = [];

    // Check for replacement indicators
    if (
      aiMetadata.roofAgeEstimate === "25_plus_years" ||
      aiMetadata.conditionAssessment === "end_of_life" ||
      aiMetadata.likelyJobType === "replacement" ||
      (customer as any).roof_age_years > 20
    ) {
      upsellRecommendations.push({
        type: "replacement",
        priority: "high",
        message:
          "Roof condition suggests full replacement may be needed within 1-2 years. Recommend free inspection?",
        estimated_value: "$12,000-$25,000",
      });
    }

    // Check for insurance opportunities
    if (
      aiMetadata.insuranceLikelihood > 60 ||
      aiMetadata.insuranceIndicators?.length > 0 ||
      aiMetadata.stormDamageDetected
    ) {
      upsellRecommendations.push({
        type: "insurance_evaluation",
        priority: "high",
        message:
          "Damage patterns suggest potential insurance coverage. Recommend insurance evaluation?",
        estimated_value: "$8,000-$20,000",
      });
    }

    // Check for maintenance plan
    if (
      !aiMetadata.stormDamageDetected &&
      aiMetadata.conditionAssessment === "mid_life" ||
      aiMetadata.conditionAssessment === "early_life"
    ) {
      upsellRecommendations.push({
        type: "maintenance_plan",
        priority: "medium",
        message:
          "Roof is in good condition. Consider annual maintenance plan to extend lifespan?",
        estimated_value: "$300-$500/year",
      });
    }

    // Update repair request with upsell flags
    const updateData: any = {};

    if (replacement_recommended !== undefined) {
      updateData.replacement_recommended = replacement_recommended;
      updateData.replacement_reason = replacement_reason || null;
    }

    if (insurance_evaluation_recommended !== undefined) {
      updateData.insurance_evaluation_recommended = insurance_evaluation_recommended;
    }

    if (Object.keys(updateData).length > 0) {
      await supabase
        .from("repair_requests")
        .update(updateData)
        .eq("id", id);
    }

    // If upsell is accepted, create lead/job opportunity
    if (upsell_type && upsell_type !== "none") {
      // Create lead or job based on upsell type
      if (upsell_type === "replacement" || upsell_type === "insurance_evaluation") {
        // Create a lead for follow-up
        const { data: lead, error: leadError } = await supabase
          .from("leads")
          .insert({
            team_id: repairRequest.team_id,
            customer_id: repairRequest.customer_id,
            name: repairRequest.customer_name || (customer as any)?.name,
            email: repairRequest.customer_email || (customer as any)?.email,
            phone: repairRequest.customer_phone || (customer as any)?.phone,
            address: repairRequest.address,
            city: repairRequest.city,
            state: repairRequest.state,
            zip_code: repairRequest.zip_code,
            source: "repair_upsell",
            job_type: upsell_type === "replacement" ? "replacement" : "insurance",
            status: "new",
            metadata: {
              repair_request_id: id,
              upsell_type,
              original_repair_type: repairRequest.ai_predicted_repair_type,
            },
          })
          .select("*")
          .single();

        if (!leadError && lead) {
          upsellRecommendations.push({
            action: "lead_created",
            lead_id: lead.id,
            message: `${upsell_type} lead created for follow-up`,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      upsell_recommendations: upsellRecommendations,
      repair_request: {
        id: repairRequest.id,
        replacement_recommended: replacement_recommended ?? repairRequest.replacement_recommended,
        insurance_evaluation_recommended:
          insurance_evaluation_recommended ?? repairRequest.insurance_evaluation_recommended,
      },
    });
  } catch (error: any) {
    console.error("Error in repair upsell API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















