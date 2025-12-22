// Block 26940 — SmartSend Roofing Field Photo & Document Intelligence v1
// API Route: Upload Field Photo with AI Analysis
// POST /api/job/[job_id]/upload-photo

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { openai } from "@/lib/openai";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ job_id: string }> }
) {
  try {
    const { job_id } = await params;
    const supabase = createClient();
    const serviceSupabase = createServiceClient();

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get job details to verify access and get workspace_id
    const { data: job, error: jobError } = await serviceSupabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      // Check if user is workspace owner
      const { data: workspace } = await serviceSupabase
        .from("workspaces")
        .select("id, owner_id")
        .eq("id", job.workspace_id)
        .single();

      if (!workspace || workspace.owner_id !== user.id) {
        return NextResponse.json(
          { error: "Access denied" },
          { status: 403 }
        );
      }
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No photo provided" },
        { status: 400 }
      );
    }

    // Upload to Supabase Storage
    const fileExt = file.name.split(".").pop() || "jpg";
    const fileName = `${crypto.randomUUID()}.${fileExt}`;
    const storagePath = `jobs/${job_id}/${fileName}`;

    // Convert file to array buffer
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await serviceSupabase.storage
      .from("job-photos")
      .upload(storagePath, uint8Array, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading file:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload photo" },
        { status: 500 }
      );
    }

    // 1. Analyze the image with OpenAI Vision API
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type || "image/jpeg";

    let aiAnalysis = null;
    try {
      const analysisResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert roofing inspector AI. Analyze roofing field photos and classify them by type and detect damage. Respond ONLY with valid JSON."
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                  detail: "high"
                }
              },
              {
                type: "text",
                text: `Analyze this roofing field photo and respond with JSON in this exact format:
{
  "category": "one of: roof, gutter, fascia, soffit, ridge, underlayment, shingles, flashing, ventilation, interior_leak_damage",
  "damage": ["array of damage types found: hail_hits, wind_creasing, missing_shingles, torn_shingles, granule_loss, soft_spots, impact_marks, improper_install, code_violations"],
  "summary": "brief description of what is visible in the photo, including any damage observed"
}

If no damage is visible, use an empty array for "damage". Be specific and accurate.`
              }
            ]
          }
        ],
        max_tokens: 500,
        response_format: { type: "json_object" }
      });

      const content = analysisResponse.choices[0]?.message?.content;
      if (content) {
        aiAnalysis = JSON.parse(content);
      }
    } catch (aiError: any) {
      console.error("Error analyzing image with AI:", aiError);
      // Continue without AI analysis if it fails
      aiAnalysis = {
        category: null,
        damage: [],
        summary: null
      };
    }

    // 2. Save to DB
    const { data: photo, error: photoError } = await serviceSupabase
      .from("roofing_field_photos")
      .insert({
        job_id,
        workspace_id: job.workspace_id,
        storage_path,
        category: aiAnalysis?.category || null,
        damage_labels: aiAnalysis?.damage || [],
        ai_summary: aiAnalysis?.summary || null,
      })
      .select()
      .single();

    if (photoError) {
      console.error("Error creating photo record:", photoError);
      return NextResponse.json(
        { error: "Failed to save photo record" },
        { status: 500 }
      );
    }

    // Get public URL
    const { data: urlData } = serviceSupabase.storage
      .from("job-photos")
      .getPublicUrl(storagePath);

    // Check if we should trigger inspection summary generation (10+ photos)
    const { count: photoCount } = await serviceSupabase
      .from("roofing_field_photos")
      .select("*", { count: "exact", head: true })
      .eq("job_id", job_id);

    if (photoCount && photoCount >= 10) {
      // Trigger edge function to generate inspection summary (async, don't wait)
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate_inspection_summary`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ job_id }),
      }).catch((err) => {
        console.error("Error triggering inspection summary generation:", err);
      });
    }

    return NextResponse.json({
      success: true,
      photo: {
        ...photo,
        url: urlData.publicUrl,
      },
      ai: aiAnalysis,
    });
  } catch (error: any) {
    console.error("Error in photo upload API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































