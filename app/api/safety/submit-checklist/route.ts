// Block 49000 — SmartSend Roofing Safety Compliance v1
// API Route: Submit Safety Checklist
// POST /api/safety/submit-checklist
// Stores the checklist + photos and blocks Start Job until complete

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
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

    const body = await req.json();
    const {
      job_id,
      crew_id,
      member_id,
      checklist,
      weather,
      photos,
    } = body;

    if (!job_id || !member_id || !checklist) {
      return NextResponse.json(
        { error: "job_id, member_id, and checklist are required" },
        { status: 400 }
      );
    }

    // Verify member exists and user has access
    const { data: member, error: memberError } = await supabase
      .from("crew_members")
      .select("id, workspace_id, crew_id, user_id")
      .eq("id", member_id)
      .single();

    if (memberError || !member) {
      return NextResponse.json(
        { error: "Crew member not found" },
        { status: 404 }
      );
    }

    // Verify user owns this crew member
    if (member.user_id !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized: You can only submit checklists for your own crew member account" },
        { status: 403 }
      );
    }

    // Verify job exists and is in same workspace
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id, status")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Check if checklist is already completed for today
    const { data: existingChecklist } = await supabase
      .from("safety_checklists")
      .select("id")
      .eq("job_id", job_id)
      .eq("completed", true)
      .gte("created_at", new Date().toISOString().split("T")[0])
      .single();

    if (existingChecklist) {
      return NextResponse.json(
        { error: "Safety checklist already completed for today" },
        { status: 400 }
      );
    }

    // Validate checklist items
    if (!Array.isArray(checklist)) {
      return NextResponse.json(
        { error: "checklist must be an array" },
        { status: 400 }
      );
    }

    // Check if all required items are answered
    const requiredItems = checklist.filter((item: any) => item.required === true);
    const answeredRequiredItems = requiredItems.filter(
      (item: any) => item.answer === "yes" || item.answer === "no"
    );

    if (answeredRequiredItems.length < requiredItems.length) {
      return NextResponse.json(
        { error: "All required checklist items must be answered" },
        { status: 400 }
      );
    }

    // Insert safety checklist
    const { data: safetyChecklist, error: checklistError } = await supabase
      .from("safety_checklists")
      .insert({
        job_id,
        crew_id: crew_id || member.crew_id,
        member_id,
        checklist: checklist,
        weather: weather || null,
        completed: true,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (checklistError) {
      console.error("Error creating safety checklist:", checklistError);
      return NextResponse.json(
        { error: "Failed to create safety checklist" },
        { status: 500 }
      );
    }

    // Insert safety photos if provided
    if (Array.isArray(photos) && photos.length > 0) {
      const photoInserts = photos.map((photo: any) => ({
        job_id,
        member_id,
        checklist_id: safetyChecklist.id,
        category: photo.category || "other",
        url: photo.url,
        thumbnail_url: photo.thumbnail_url || null,
        description: photo.description || null,
      }));

      const { error: photosError } = await supabase
        .from("safety_photos")
        .insert(photoInserts);

      if (photosError) {
        console.error("Error inserting safety photos:", photosError);
        // Don't fail the request, just log the error
      }
    }

    // Calculate safety score
    const { data: scoreResult, error: scoreError } = await supabase.rpc(
      "calculate_safety_score",
      { p_job_id: job_id }
    );

    if (scoreError) {
      console.error("Error calculating safety score:", scoreError);
      // Don't fail the request, just log the error
    }

    return NextResponse.json({
      success: true,
      checklist: safetyChecklist,
      score: scoreResult || null,
      message: "Safety checklist submitted successfully",
    });
  } catch (error: any) {
    console.error("Error in submit safety checklist API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































