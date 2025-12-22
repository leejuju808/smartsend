// Block 19940 — SmartSend Inbox Photo Intelligence v1
// POST /api/inbox/photo/analyze
// Analyzes homeowner photos from inbox messages and stores results in image_analysis_reports

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { analyzeInboxPhotoWithAI } from "@/src/lib/ai/inboxPhotoIntelligence";

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { threadId, contactId, attachmentId, messageId, imageUrl } = body;

    if (!contactId || (!attachmentId && !imageUrl)) {
      return NextResponse.json(
        { error: "contactId and either attachmentId or imageUrl are required" },
        { status: 400 }
      );
    }

    // Get contact and workspace
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, workspace_id")
      .eq("id", contactId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Get or find thread if not provided
    let finalThreadId = threadId;
    if (!finalThreadId && contactId) {
      const { data: existingThread } = await supabase
        .from("inbox_threads")
        .select("id")
        .eq("contact_id", contactId)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      finalThreadId = existingThread?.id || null;
    }

    // Get image URL
    let finalImageUrl = imageUrl;
    if (attachmentId && !imageUrl) {
      const { data: attachment, error: attachError } = await supabase
        .from("attachments")
        .select("storage_path, file_type")
        .eq("id", attachmentId)
        .single();

      if (attachError || !attachment) {
        return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
      }

      if (!attachment.file_type.startsWith("image/")) {
        return NextResponse.json({ error: "File is not an image" }, { status: 400 });
      }

      const { data: urlData } = await supabase.storage
        .from("attachments")
        .createSignedUrl(attachment.storage_path, 3600);

      if (!urlData?.signedUrl) {
        return NextResponse.json({ error: "Failed to generate image URL" }, { status: 500 });
      }

      finalImageUrl = urlData.signedUrl;
    }

    // Analyze photo with AI (Block 19940 enhanced analysis)
    const analysis = await analyzeInboxPhotoWithAI(finalImageUrl);

    // Check if analysis report already exists for this attachment
    const { data: existingReport } = await supabase
      .from("image_analysis_reports")
      .select("*")
      .eq("attachment_id", attachmentId || "")
      .maybeSingle();

    // Prepare image analysis report record
    const reportData: any = {
      thread_id: finalThreadId,
      contact_id: contactId,
      workspace_id: contact.workspace_id,
      attachment_id: attachmentId || null,
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
    };

    // Upsert image analysis report
    const { data: report, error: reportError } = await supabase
      .from("image_analysis_reports")
      .upsert(reportData, {
        onConflict: existingReport ? 'id' : undefined,
      })
      .select()
      .single();

    if (reportError) {
      console.error("Error saving image analysis report:", reportError);
      return NextResponse.json(
        { error: "Failed to save analysis report", details: reportError.message },
        { status: 500 }
      );
    }

    // Update thread estimated value if value range is provided and thread exists
    if (finalThreadId && analysis.valueRangeMax) {
      const avgValue = analysis.valueRangeMin && analysis.valueRangeMax
        ? (analysis.valueRangeMin + analysis.valueRangeMax) / 2
        : analysis.valueRangeMax;

      await supabase
        .from("inbox_threads")
        .update({
          thread_estimated_value: avgValue,
          revenue_metadata: {
            ...(await supabase.from("inbox_threads").select("revenue_metadata").eq("id", finalThreadId).single().then(r => r.data?.revenue_metadata || {})),
            photo_analysis_value_range: analysis.valueRangeFormatted,
            photo_analysis_job_type: analysis.potentialJobType,
            photo_analysis_severity: analysis.severity,
          },
        })
        .eq("id", finalThreadId);
    }

    // Update thread insurance likelihood if high
    if (finalThreadId && analysis.insuranceLikelihood >= 50) {
      await supabase
        .from("inbox_threads")
        .update({
          revenue_metadata: {
            ...(await supabase.from("inbox_threads").select("revenue_metadata").eq("id", finalThreadId).single().then(r => r.data?.revenue_metadata || {})),
            photo_insurance_likelihood: analysis.insuranceLikelihood,
            photo_insurance_indicators: analysis.insuranceIndicators,
          },
        })
        .eq("id", finalThreadId);
    }

    return NextResponse.json({
      success: true,
      analysis: report,
      insights: {
        damageType: analysis.damageType,
        severity: analysis.severity,
        severityLabel: analysis.severityLabel,
        material: analysis.materialDetected,
        insuranceLikelihood: analysis.insuranceLikelihood,
        recommendedNextStep: analysis.recommendedNextStep,
        valueRange: analysis.valueRangeFormatted,
      },
    });
  } catch (error: any) {
    console.error("Error analyzing inbox photo:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



















































