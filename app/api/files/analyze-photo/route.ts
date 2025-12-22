// Block 17000 — Photo Analysis API
// POST /api/files/analyze-photo
// Analyzes uploaded photos using AI to detect damage types and categorize

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { cookies } from "next/headers";
import { logContactActivity } from "@/lib/contactActivity";

// Helper to get current org_id
async function getCurrentOrgId(supabase: any, userId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("current_org_id")?.value || cookieStore.get("org_id")?.value;
  
  if (orgId) return orgId;

  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return membership?.org_id || null;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { attachmentId } = body;

    if (!attachmentId) {
      return NextResponse.json({ error: "attachmentId is required" }, { status: 400 });
    }

    const orgId = await getCurrentOrgId(supabase, user.id);
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    // Get attachment details
    const { data: attachment, error: attachmentError } = await supabase
      .from("attachments")
      .select(`
        id,
        contact_id,
        org_id,
        file_name,
        file_type,
        storage_path,
        url
      `)
      .eq("id", attachmentId)
      .eq("org_id", orgId)
      .single();

    if (attachmentError || !attachment) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    // Only analyze images
    if (!attachment.file_type.startsWith("image/")) {
      return NextResponse.json({ error: "File is not an image" }, { status: 400 });
    }

    // Get signed URL for the image
    const { data: urlData } = await supabase.storage
      .from("attachments")
      .createSignedUrl(attachment.storage_path, 3600);

    if (!urlData?.signedUrl) {
      return NextResponse.json({ error: "Failed to generate image URL" }, { status: 500 });
    }

    // Call AI analysis service (edge function or external API)
    // For now, we'll use a placeholder that can be replaced with actual AI service
    const analysisResult = await analyzePhotoWithAI(urlData.signedUrl);

    // Create photo_analysis record
    const { data: photoAnalysis, error: analysisInsertError } = await supabase
      .from("photo_analysis")
      .insert({
        attachment_id: attachmentId,
        org_id: orgId,
        contact_id: attachment.contact_id,
        detected_damage_type: analysisResult.damageType,
        confidence: analysisResult.confidence,
        ai_tags: analysisResult.tags || [],
        analysis_metadata: analysisResult.metadata || {},
      })
      .select()
      .single();

    if (analysisInsertError) {
      console.error("Error creating photo analysis:", analysisInsertError);
      return NextResponse.json({ error: "Failed to save analysis" }, { status: 500 });
    }

    // Update attachment with analysis results
    const { error: updateError } = await supabase
      .from("attachments")
      .update({
        photo_analysis_id: photoAnalysis.id,
        detected_damage_type: analysisResult.damageType,
        ai_label: analysisResult.label,
        ai_tags: analysisResult.tags || [],
      })
      .eq("id", attachmentId);

    if (updateError) {
      console.error("Error updating attachment:", updateError);
    }

    // Log activity
    await logContactActivity({
      orgId,
      contactId: attachment.contact_id,
      type: "note_added",
      title: `Photo analyzed: ${analysisResult.label || "Roof photo"}`,
      description: `AI detected: ${analysisResult.damageType || "General roof overview"} (${analysisResult.confidence || 0}% confidence)`,
      userId: user.id,
      meta: {
        attachment_id: attachmentId,
        photo_analysis_id: photoAnalysis.id,
        detected_damage_type: analysisResult.damageType,
        event_type: "photo_analyzed",
      },
    });

    // Trigger pipeline updates based on damage type
    await triggerPipelineUpdates(supabase, {
      contactId: attachment.contact_id,
      orgId,
      damageType: analysisResult.damageType,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      analysis: photoAnalysis,
      detected_damage_type: analysisResult.damageType,
      label: analysisResult.label,
      confidence: analysisResult.confidence,
    });
  } catch (error: any) {
    console.error("Error analyzing photo:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Placeholder AI analysis function - replace with actual AI service
async function analyzePhotoWithAI(imageUrl: string): Promise<{
  damageType: string | null;
  label: string;
  confidence: number;
  tags: string[];
  metadata: Record<string, any>;
}> {
  // TODO: Replace with actual AI service call (OpenAI Vision, Google Vision, etc.)
  // For now, return a mock response
  
  // In production, call your AI service:
  // const response = await fetch('https://your-ai-service.com/analyze', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ image_url: imageUrl })
  // });
  // return await response.json();

  // Mock response for development
  return {
    damageType: null, // Will be determined by AI
    label: "General roof overview",
    confidence: 75,
    tags: ["roof", "general"],
    metadata: {},
  };
}

// Trigger pipeline updates based on photo analysis
async function triggerPipelineUpdates(
  supabase: any,
  params: {
    contactId: string;
    orgId: string;
    damageType: string | null;
    userId: string;
  }
) {
  const { contactId, orgId, damageType, userId } = params;

  if (!damageType) return;

  try {
    // Get workspace_id from org
    const { data: org } = await supabase
      .from("organizations")
      .select("workspace_id")
      .eq("id", orgId)
      .single();

    if (!org?.workspace_id) return;

    // Determine pipeline stage based on damage type
    let pipelineStageKey: string | null = null;
    let taskTitle: string | null = null;
    let taskUrgency: "normal" | "urgent" | "critical" = "normal";

    if (damageType === "hail_damage" || damageType === "wind_damage") {
      pipelineStageKey = "insurance_opportunity";
      taskTitle = `Follow up on ${damageType.replace("_", " ")} - Insurance claim opportunity`;
    } else if (damageType === "leak_water_stain") {
      pipelineStageKey = "hot_lead";
      taskTitle = "URGENT: Leak detected - Schedule inspection ASAP";
      taskUrgency = "critical";
    } else if (damageType === "skylight_issue") {
      taskTitle = "Skylight repair opportunity - Recommend skylight upsell";
    } else if (damageType === "shingle_damage" || damageType === "gutter_damage") {
      taskTitle = `Follow up on ${damageType.replace("_", " ")} - Increase job value estimate`;
    }

    // Update pipeline stage if determined
    if (pipelineStageKey) {
      const { data: stage } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("workspace_id", org.workspace_id)
        .eq("key", pipelineStageKey)
        .maybeSingle();

      if (stage) {
        await supabase
          .from("contacts")
          .update({
            pipeline_stage_id: stage.id,
            pipeline_stage_key: pipelineStageKey,
            updated_at: new Date().toISOString(),
          })
          .eq("id", contactId)
          .eq("org_id", orgId);
      }
    }

    // Create task if needed
    if (taskTitle) {
      const dueDate = new Date();
      if (taskUrgency === "critical") {
        dueDate.setHours(dueDate.getHours() + 2); // Due in 2 hours for critical
      } else {
        dueDate.setDate(dueDate.getDate() + 1); // Due tomorrow for normal
      }

      // Check if tasks table exists and create task
      const { error: taskError } = await supabase
        .from("smartsend_tasks")
        .insert({
          workspace_id: org.workspace_id,
          org_id: orgId,
          contact_id: contactId,
          user_id: userId,
          task_type: "follow_up",
          urgency: taskUrgency,
          status: "today",
          title: taskTitle,
          description: `Auto-generated from photo analysis detecting ${damageType}`,
          due_at: dueDate.toISOString(),
          auto_generated: true,
          auto_source: "photo_analysis",
          created_by: userId,
        });

      if (taskError) {
        console.error("Error creating task:", taskError);
      }
    }
  } catch (error) {
    console.error("Error triggering pipeline updates:", error);
  }
}
