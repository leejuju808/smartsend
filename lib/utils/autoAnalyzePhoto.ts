// Block 19940 — SmartSend Inbox Photo Intelligence v1
// Utility function to automatically analyze photos when they're attached to inbox messages

import { createClient } from "@supabase/supabase-js";
import { analyzeInboxPhotoWithAI } from "@/src/lib/ai/inboxPhotoIntelligence";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Automatically analyze a photo attachment and create an inbox analysis report
 * This should be called when a photo is attached to an inbox message
 */
export async function autoAnalyzeInboxPhoto(params: {
  attachmentId: string;
  threadId?: string;
  contactId: string;
  workspaceId: string;
  messageId?: string;
}): Promise<void> {
  const { attachmentId, threadId, contactId, workspaceId, messageId } = params;

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get attachment details
    const { data: attachment, error: attachError } = await supabase
      .from("attachments")
      .select("storage_path, file_type")
      .eq("id", attachmentId)
      .single();

    if (attachError || !attachment) {
      console.error("Attachment not found for analysis:", attachError);
      return;
    }

    // Only analyze images
    if (!attachment.file_type.startsWith("image/")) {
      return;
    }

    // Get signed URL for the image
    const { data: urlData } = await supabase.storage
      .from("attachments")
      .createSignedUrl(attachment.storage_path, 3600);

    if (!urlData?.signedUrl) {
      console.error("Failed to generate signed URL for photo analysis");
      return;
    }

    // Analyze photo with AI
    const analysis = await analyzeInboxPhotoWithAI(urlData.signedUrl);

    // Find thread if not provided
    let finalThreadId = threadId;
    if (!finalThreadId) {
      const { data: existingThread } = await supabase
        .from("inbox_threads")
        .select("id")
        .eq("contact_id", contactId)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      finalThreadId = existingThread?.id || null;
    }

    // Check if analysis already exists
    const { data: existingReport } = await supabase
      .from("image_analysis_reports")
      .select("id")
      .eq("attachment_id", attachmentId)
      .maybeSingle();

    if (existingReport) {
      // Update existing report
      await supabase
        .from("image_analysis_reports")
        .update({
          thread_id: finalThreadId,
          message_id: messageId || null,
          damage_type: analysis.damageType,
          damage_types: analysis.damageTypes,
          severity: analysis.severity,
          severity_label: analysis.severityLabel,
          severity_description: analysis.severityDescription,
          material_detected: analysis.materialDetected,
          material_confidence: analysis.materialConfidence,
          slope_estimation: analysis.slopeEstimation,
          roof_condition_notes: analysis.roofConditionNotes,
          condition_summary: analysis.conditionSummary,
          insurance_likelihood: analysis.insuranceLikelihood,
          insurance_indicators: analysis.insuranceIndicators,
          recommended_next_step: analysis.recommendedNextStep,
          recommended_action_type: analysis.recommendedActionType,
          potential_job_type: analysis.potentialJobType,
          job_type_confidence: analysis.jobTypeConfidence,
          value_range_min: analysis.valueRangeMin,
          value_range_max: analysis.valueRangeMax,
          value_range_type: analysis.valueRangeType,
          value_range_formatted: analysis.valueRangeFormatted,
          analysis_model: analysis.analysisModel,
          analysis_version: analysis.analysisVersion,
          analysis_metadata: analysis.analysisMetadata,
          analyzed_at: new Date().toISOString(),
        })
        .eq("id", existingReport.id);
    } else {
      // Create new report
      await supabase
        .from("image_analysis_reports")
        .insert({
          thread_id: finalThreadId,
          contact_id: contactId,
          workspace_id: workspaceId,
          attachment_id: attachmentId,
          message_id: messageId || null,
          damage_type: analysis.damageType,
          damage_types: analysis.damageTypes,
          severity: analysis.severity,
          severity_label: analysis.severityLabel,
          severity_description: analysis.severityDescription,
          material_detected: analysis.materialDetected,
          material_confidence: analysis.materialConfidence,
          slope_estimation: analysis.slopeEstimation,
          roof_condition_notes: analysis.roofConditionNotes,
          condition_summary: analysis.conditionSummary,
          insurance_likelihood: analysis.insuranceLikelihood,
          insurance_indicators: analysis.insuranceIndicators,
          recommended_next_step: analysis.recommendedNextStep,
          recommended_action_type: analysis.recommendedActionType,
          potential_job_type: analysis.potentialJobType,
          job_type_confidence: analysis.jobTypeConfidence,
          value_range_min: analysis.valueRangeMin,
          value_range_max: analysis.valueRangeMax,
          value_range_type: analysis.valueRangeType,
          value_range_formatted: analysis.valueRangeFormatted,
          analysis_model: analysis.analysisModel,
          analysis_version: analysis.analysisVersion,
          analysis_metadata: analysis.analysisMetadata,
        });
    }

    // Update thread estimated value if value range is provided
    if (finalThreadId && analysis.valueRangeMax) {
      const avgValue = analysis.valueRangeMin && analysis.valueRangeMax
        ? (analysis.valueRangeMin + analysis.valueRangeMax) / 2
        : analysis.valueRangeMax;

      const { data: currentThread } = await supabase
        .from("inbox_threads")
        .select("revenue_metadata")
        .eq("id", finalThreadId)
        .single();

      await supabase
        .from("inbox_threads")
        .update({
          thread_estimated_value: avgValue,
          revenue_metadata: {
            ...(currentThread?.revenue_metadata || {}),
            photo_analysis_value_range: analysis.valueRangeFormatted,
            photo_analysis_job_type: analysis.potentialJobType,
            photo_analysis_severity: analysis.severity,
          },
        })
        .eq("id", finalThreadId);
    }

    console.log(`✅ Auto-analyzed photo ${attachmentId} for inbox thread ${finalThreadId}`);
  } catch (error) {
    console.error("Error auto-analyzing inbox photo:", error);
    // Don't throw - this is a background operation
  }
}



















































