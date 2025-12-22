// Block 255500 — SmartSend Repair Division Engine v1
// POST /api/repairs/[id]/diagnose
// AI Auto-Diagnosis for repair requests

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { analyzeInboxPhotoWithAI } from "@/src/lib/ai/inboxPhotoIntelligence";

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

    // Get repair request
    const { data: repairRequest, error: requestError } = await supabase
      .from("repair_requests")
      .select("*")
      .eq("id", id)
      .single();

    if (requestError || !repairRequest) {
      return NextResponse.json(
        { error: "Repair request not found" },
        { status: 404 }
      );
    }

    // If photos exist, analyze them
    let aiAnalysis = null;
    if (repairRequest.photos && repairRequest.photos.length > 0) {
      try {
        const photoAnalysis = await analyzeInboxPhotoWithAI(repairRequest.photos[0]);

        // Get pricing from matrix if available
        const repairType = mapDamageToRepairType(photoAnalysis.damageType || "");
        const { data: pricing } = await supabase
          .from("repair_pricing_matrix")
          .select("*")
          .eq("team_id", repairRequest.team_id)
          .eq("repair_type", repairType)
          .eq("is_active", true)
          .single();

        aiAnalysis = {
          ai_issue_prediction: photoAnalysis.damageType || "unknown",
          ai_predicted_repair_type: repairType,
          ai_estimated_cost_min: pricing?.price_min || photoAnalysis.valueRangeMin || 150,
          ai_estimated_cost_max: pricing?.price_max || photoAnalysis.valueRangeMax || 400,
          ai_estimated_time_minutes: pricing?.estimated_time_minutes || estimateTimeFromDamage(photoAnalysis.damageType || ""),
          ai_materials_needed: pricing?.typical_materials || extractMaterialsFromAnalysis(photoAnalysis),
          ai_skill_level_required: pricing?.skill_level_required || mapSeverityToSkillLevel(photoAnalysis.severity || 50),
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
            pricing_source: pricing ? "matrix" : "ai_estimate",
          },
        };

        // Update urgency if needed
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
        console.error("AI diagnosis error:", aiError);
        return NextResponse.json(
          { error: "Failed to perform AI diagnosis", details: (aiError as Error).message },
          { status: 500 }
        );
      }
    } else {
      // Analyze description text if no photos
      aiAnalysis = await analyzeDescription(repairRequest.description);
    }

    // Update repair request with diagnosis
    const { data: updatedRequest, error: updateError } = await supabase
      .from("repair_requests")
      .update({
        ...aiAnalysis,
        status: "diagnosed",
      })
      .eq("id", id)
      .select("*")
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update repair request", details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      repair_request: updatedRequest,
      diagnosis: {
        predicted_issue: aiAnalysis.ai_issue_prediction,
        repair_type: aiAnalysis.ai_predicted_repair_type,
        estimated_cost: `$${aiAnalysis.ai_estimated_cost_min}–$${aiAnalysis.ai_estimated_cost_max}`,
        estimated_time: `${aiAnalysis.ai_estimated_time_minutes} minutes`,
        materials_needed: aiAnalysis.ai_materials_needed,
        skill_level: aiAnalysis.ai_skill_level_required,
        urgency: aiAnalysis.urgency || repairRequest.urgency,
        confidence: `${aiAnalysis.ai_confidence_score}%`,
      },
    });
  } catch (error: any) {
    console.error("Error in repair diagnose API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper functions (same as intake route)
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

function mapSeverityToSkillLevel(severity: number): string {
  if (severity >= 80) return "expert";
  if (severity >= 50) return "advanced";
  if (severity >= 20) return "intermediate";
  return "basic";
}

async function analyzeDescription(description: string): Promise<any> {
  // Basic keyword-based analysis if no photos
  const lowerDesc = description.toLowerCase();
  
  let repairType = "general_repair";
  let costMin = 150;
  let costMax = 400;
  let timeMinutes = 45;
  let skillLevel = "intermediate";
  let urgency = "medium";

  if (lowerDesc.includes("pipe") || lowerDesc.includes("boot")) {
    repairType = "pipe_boot_replacement";
    costMin = 250;
    costMax = 350;
    timeMinutes = 45;
    skillLevel = "intermediate";
  } else if (lowerDesc.includes("shingle")) {
    repairType = "shingle_replacement_1_3_tabs";
    costMin = 200;
    costMax = 300;
    timeMinutes = 35;
    skillLevel = "basic";
  } else if (lowerDesc.includes("chimney")) {
    repairType = "chimney_counterflashing";
    costMin = 400;
    costMax = 550;
    timeMinutes = 90;
    skillLevel = "advanced";
  } else if (lowerDesc.includes("leak") && lowerDesc.includes("emergency")) {
    urgency = "emergency";
  } else if (lowerDesc.includes("leak")) {
    urgency = "high";
  }

  return {
    ai_issue_prediction: "description_analysis",
    ai_predicted_repair_type: repairType,
    ai_estimated_cost_min: costMin,
    ai_estimated_cost_max: costMax,
    ai_estimated_time_minutes: timeMinutes,
    ai_materials_needed: ["caulk", "sealant"],
    ai_skill_level_required: skillLevel,
    ai_confidence_score: 60,
    urgency,
    ai_analysis_metadata: {
      analysis_method: "keyword_based",
      description,
    },
  };
}





















