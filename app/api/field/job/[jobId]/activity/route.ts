// Block 22750 — SmartSend Roofing Field App v1
// API Route: Get Field Activity for a Job (Office View)
// GET /api/field/job/[jobId]/activity

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const supabase = createClient();
    const { jobId } = await params;

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

    // Get job to verify access
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", jobId)
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
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Fetch field sessions
    const { data: sessions, error: sessionsError } = await supabase
      .from("job_field_sessions")
      .select(`
        *,
        crew:crews(id, name, color),
        user:auth.users(id, email)
      `)
      .eq("job_id", jobId)
      .order("check_in_at", { ascending: false });

    if (sessionsError) {
      console.error("Error fetching sessions:", sessionsError);
    }

    // Fetch field photos
    const { data: photos, error: photosError } = await supabase
      .from("job_field_photos")
      .select(`
        *,
        crew:crews(id, name, color),
        user:auth.users(id, email)
      `)
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (photosError) {
      console.error("Error fetching photos:", photosError);
    }

    // Fetch field notes
    const { data: notes, error: notesError } = await supabase
      .from("job_field_notes")
      .select(`
        *,
        crew:crews(id, name, color),
        user:auth.users(id, email)
      `)
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (notesError) {
      console.error("Error fetching notes:", notesError);
    }

    // Get public URLs for photos
    const photosWithUrls = (photos || []).map((photo: any) => {
      const { data: urlData } = supabase.storage
        .from("field-photos")
        .getPublicUrl(photo.storage_path);

      return {
        ...photo,
        url: urlData.publicUrl,
      };
    });

    return NextResponse.json(
      {
        sessions: sessions || [],
        photos: photosWithUrls,
        notes: notes || [],
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in field activity API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}







































