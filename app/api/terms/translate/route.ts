// Block 18800 — SmartSend Roofing Terminology Translator v1
// POST /api/terms/translate
// Translates homeowner message to roofing terminology

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import {
  translateHomeownerMessage,
  calculateReplacementProbability,
  detectMaterialFromMessage,
} from "@/lib/roofing-terminology-translator";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      message,
      contactId,
      workspaceId,
      messageSource = "manual",
      messageTimestamp,
    } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Get workspace_id if not provided
    let finalWorkspaceId = workspaceId;
    if (!finalWorkspaceId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("workspace_id")
        .eq("id", user.id)
        .single();

      if (!profile?.workspace_id) {
        return NextResponse.json(
          { error: "Workspace not found" },
          { status: 400 }
        );
      }
      finalWorkspaceId = profile.workspace_id;
    }

    // Translate the message
    const translation = await translateHomeownerMessage(
      message,
      contactId,
      finalWorkspaceId
    );

    // Enhance with additional calculations
    const replacementInfo = calculateReplacementProbability(message);
    const materialInfo = detectMaterialFromMessage(message);

    // Merge material detection if AI didn't detect it
    if (!translation.detectedMaterial && materialInfo.material) {
      translation.detectedMaterial = materialInfo.material;
      translation.materialConfidence = materialInfo.confidence;
    }

    // Merge replacement probability if AI didn't calculate it well
    if (translation.replacementProbability === "uncertain" && replacementInfo.probability !== "uncertain") {
      translation.replacementProbability = replacementInfo.probability;
      translation.replacementLikelihoodScore = replacementInfo.score;
    }

    // Save translation to database
    const { data: savedTranslation, error: saveError } = await supabase
      .from("terminology_translations")
      .insert({
        contact_id: contactId || null,
        workspace_id: finalWorkspaceId,
        homeowner_message: message,
        message_source: messageSource,
        message_timestamp: messageTimestamp || new Date().toISOString(),
        roofing_term: translation.roofingTerm,
        material_type: translation.materialType,
        damage_type: translation.damageType,
        repair_category: translation.repairCategory,
        storm_category: translation.stormCategory,
        insurance_category: translation.insuranceCategory,
        urgency_level: translation.urgencyLevel,
        severity_score: translation.severityScore,
        ai_explanation: translation.aiExplanation,
        detected_keywords: translation.detectedKeywords,
        keyword_explanations: translation.keywordExplanations,
        detected_material: translation.detectedMaterial,
        material_confidence: translation.materialConfidence,
        storm_impact_score: translation.stormImpactScore,
        replacement_probability: translation.replacementProbability,
        replacement_likelihood_score: translation.replacementLikelihoodScore,
        recommended_action: translation.recommendedAction,
        recommended_tasks: translation.recommendedTasks,
        repair_cost_range: translation.repairCostRange,
        translation_confidence: translation.translationConfidence,
      })
      .select()
      .single();

    if (saveError) {
      console.error("Error saving translation:", saveError);
      // Return translation even if save fails
      return NextResponse.json({
        ok: true,
        translation,
        saved: false,
        error: saveError.message,
      });
    }

    // Update homeowner phrases table for learning
    if (translation.roofingTerm) {
      await supabase.rpc("increment_homeowner_phrase_usage", {
        p_workspace_id: finalWorkspaceId,
        p_phrase: message.substring(0, 200), // Truncate long messages
        p_roofing_term: translation.roofingTerm,
        p_category: translation.damageType,
      }).catch((err) => {
        console.warn("Failed to update homeowner phrases:", err);
      });
    }

    return NextResponse.json({
      ok: true,
      translation,
      translationId: savedTranslation?.id,
      saved: true,
    });
  } catch (error: any) {
    console.error("Error in terminology translation:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































