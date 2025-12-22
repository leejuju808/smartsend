// Block 255500 — SmartSend Repair Division Engine v1
// POST /api/repairs/intake
// Smart Repair Intake Form with AI-powered photo analysis

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeInboxPhotoWithAI } from "@/src/lib/ai/inboxPhotoIntelligence";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      team_id,
      customer_id,
      customer_name,
      customer_phone,
      customer_email,
      address,
      city,
      state,
      zip_code,
      description,
      photos = [], // Array of photo URLs
      preferred_date,
      preferred_time_range,
      urgency = "medium",
    } = body;

    if (!team_id || !address || !description) {
      return NextResponse.json(
        { error: "team_id, address, and description are required" },
        { status: 400 }
      );
    }

    // Verify team access
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("id, owner_id")
      .eq("id", team_id)
      .single();

    if (teamError || !team) {
      return NextResponse.json(
        { error: "Team not found or access denied" },
        { status: 404 }
      );
    }

    // Get or create customer if customer_id not provided
    let finalCustomerId = customer_id;
    if (!finalCustomerId && (customer_email || customer_phone)) {
      // Try to find existing customer
      const { data: existingCustomer } = await supabase
        .from("customers")
        .select("id")
        .eq("team_id", team_id)
        .or(
          customer_email
            ? `email.eq.${customer_email}`
            : `phone.eq.${customer_phone}`
        )
        .single();

      if (existingCustomer) {
        finalCustomerId = existingCustomer.id;
      } else if (customer_name || customer_email || customer_phone) {
        // Create new customer
        const { data: newCustomer, error: customerError } = await supabase
          .from("customers")
          .insert({
            team_id,
            name: customer_name,
            email: customer_email,
            phone: customer_phone,
            address,
            city,
            state,
            zip_code,
          })
          .select("id")
          .single();

        if (!customerError && newCustomer) {
          finalCustomerId = newCustomer.id;
        }
      }
    }

    // AI Analysis of photos and description
    let aiAnalysis = null;
    if (photos.length > 0) {
      try {
        // Analyze first photo (can be extended to analyze all photos)
        const photoAnalysis = await analyzeInboxPhotoWithAI(photos[0]);
        
        // Map AI analysis to repair-specific predictions
        aiAnalysis = {
          ai_issue_prediction: photoAnalysis.damageType || "unknown",
          ai_predicted_repair_type: mapDamageToRepairType(photoAnalysis.damageType),
          ai_estimated_cost_min: photoAnalysis.valueRangeMin || 150,
          ai_estimated_cost_max: photoAnalysis.valueRangeMax || 400,
          ai_estimated_time_minutes: estimateTimeFromDamage(photoAnalysis.damageType),
          ai_materials_needed: extractMaterialsFromAnalysis(photoAnalysis),
          ai_skill_level_required: mapSeverityToSkillLevel(photoAnalysis.severity || 50),
          ai_confidence_score: photoAnalysis.jobTypeConfidence
            ? Math.round(photoAnalysis.jobTypeConfidence * 100)
            : 75,
          ai_analysis_metadata: {
            damageType: photoAnalysis.damageType,
            severity: photoAnalysis.severity,
            severityDescription: photoAnalysis.severityDescription,
            materialDetected: photoAnalysis.materialDetected,
            recommendedActionType: photoAnalysis.recommendedActionType,
            recommendedNextStep: photoAnalysis.recommendedNextStep,
            insuranceLikelihood: photoAnalysis.insuranceLikelihood,
          },
        };

        // Auto-set urgency based on AI analysis
        if (photoAnalysis.severity >= 80 || photoAnalysis.recommendedActionType === "emergency_repair") {
          aiAnalysis.urgency = "emergency";
        } else if (photoAnalysis.severity >= 50) {
          aiAnalysis.urgency = "high";
        } else if (photoAnalysis.severity >= 20) {
          aiAnalysis.urgency = "medium";
        } else {
          aiAnalysis.urgency = "low";
        }
      } catch (aiError) {
        console.error("AI analysis error:", aiError);
        // Continue without AI analysis if it fails
      }
    }

    // Create repair request
    const { data: repairRequest, error: requestError } = await supabase
      .from("repair_requests")
      .insert({
        team_id,
        customer_id: finalCustomerId,
        customer_name: customer_name || null,
        customer_phone: customer_phone || null,
        customer_email: customer_email || null,
        address,
        city: city || null,
        state: state || null,
        zip_code: zip_code || null,
        description,
        photos,
        preferred_date: preferred_date || null,
        preferred_time_range: preferred_time_range || null,
        urgency: aiAnalysis?.urgency || urgency,
        ...(aiAnalysis || {}),
        status: "new",
      })
      .select("*")
      .single();

    if (requestError) {
      console.error("Error creating repair request:", requestError);
      return NextResponse.json(
        { error: "Failed to create repair request", details: requestError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      repair_request: repairRequest,
      ai_analysis: aiAnalysis ? {
        predicted_issue: aiAnalysis.ai_issue_prediction,
        estimated_cost: `$${aiAnalysis.ai_estimated_cost_min}–$${aiAnalysis.ai_estimated_cost_max}`,
        estimated_time: `${aiAnalysis.ai_estimated_time_minutes} minutes`,
        urgency: aiAnalysis.urgency,
      } : null,
    });
  } catch (error: any) {
    console.error("Error in repair intake API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper function to map damage type to repair type
function mapDamageToRepairType(damageType: string): string {
  const mapping: Record<string, string> = {
    vent_pipe_boot_deterioration: "pipe_boot_replacement",
    missing_shingles: "shingle_replacement_1_3_tabs",
    torn_shingles: "shingle_replacement_1_3_tabs",
    lifted_shingles: "shingle_replacement_1_3_tabs",
    chimney_leak: "chimney_counterflashing",
    skylight_leak: "skylight_leak_reseal",
    gutter_overflow: "gutter_reattachment",
    flashing_separation: "vent_reseal",
  };
  return mapping[damageType] || "general_repair";
}

// Helper function to estimate time from damage type
function estimateTimeFromDamage(damageType: string): number {
  const timeMap: Record<string, number> = {
    pipe_boot_replacement: 45,
    shingle_replacement_1_3_tabs: 35,
    chimney_counterflashing: 90,
    vent_reseal: 30,
    gutter_reattachment: 25,
    skylight_leak_reseal: 60,
  };
  return timeMap[mapDamageToRepairType(damageType)] || 45;
}

// Helper function to extract materials from AI analysis
function extractMaterialsFromAnalysis(analysis: any): string[] {
  const materials: string[] = [];
  const damageType = analysis.damageType || "";

  if (damageType.includes("pipe") || damageType.includes("boot")) {
    materials.push("pipe_boot", "caulk", "flashing");
  }
  if (damageType.includes("shingle")) {
    materials.push("shingles", "nails", "caulk");
  }
  if (damageType.includes("chimney")) {
    materials.push("flashing", "caulk", "sealant");
  }
  if (damageType.includes("vent")) {
    materials.push("caulk", "sealant");
  }
  if (damageType.includes("gutter")) {
    materials.push("screws", "brackets");
  }
  if (damageType.includes("skylight")) {
    materials.push("flashing", "caulk", "sealant");
  }

  return materials.length > 0 ? materials : ["caulk", "sealant"];
}

// Helper function to map severity to skill level
function mapSeverityToSkillLevel(severity: number): string {
  if (severity >= 80) return "expert";
  if (severity >= 50) return "advanced";
  if (severity >= 20) return "intermediate";
  return "basic";
}





















