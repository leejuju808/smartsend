// Block 255400 — Field Operations Command v1
// API Route: Crew Communications
// GET/POST /api/field-ops/communications

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET: Get communications for a job
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

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

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("job_id");
    const unreadOnly = searchParams.get("unread_only") === "true";

    if (!jobId) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Verify job access
    const { data: job } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", jobId)
      .single();

    if (job) {
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
    } else {
      // Try jobs table
      const { data: jobAlt } = await supabase
        .from("jobs")
        .select("id, team_id")
        .eq("id", jobId)
        .single();

      if (jobAlt) {
        const { data: teamMember } = await supabase
          .from("team_members")
          .select("team_id")
          .eq("team_id", jobAlt.team_id)
          .eq("user_id", user.id)
          .single();

        if (!teamMember) {
          return NextResponse.json(
            { error: "Access denied" },
            { status: 403 }
          );
        }
      } else {
        return NextResponse.json(
          { error: "Job not found" },
          { status: 404 }
        );
      }
    }

    // Build query
    let query = supabase
      .from("crew_communications")
      .select(
        `
        *,
        crew_members!crew_communications_from_crew_member_id_fkey(
          id,
          name
        )
      `
      )
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (unreadOnly) {
      query = query.eq("to_user_id", user.id).is("read_at", null);
    }

    const { data: communications, error: commError } = await query;

    if (commError) {
      console.error("Error fetching communications:", commError);
      return NextResponse.json(
        { error: commError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ communications: communications || [] }, { status: 200 });
  } catch (error: any) {
    console.error("Error in communications get endpoint:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

// POST: Send a communication
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

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

    const body = await req.json();
    const {
      job_id,
      to_user_id,
      message_type,
      message,
      voice_note_url,
      photo_urls,
      is_urgent = false,
    } = body;

    if (!job_id || !message_type) {
      return NextResponse.json(
        { error: "Missing required fields: job_id, message_type" },
        { status: 400 }
      );
    }

    // Verify job access
    const { data: job } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", job_id)
      .single();

    if (job) {
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
    } else {
      // Try jobs table
      const { data: jobAlt } = await supabase
        .from("jobs")
        .select("id, team_id")
        .eq("id", job_id)
        .single();

      if (jobAlt) {
        const { data: teamMember } = await supabase
          .from("team_members")
          .select("team_id")
          .eq("team_id", jobAlt.team_id)
          .eq("user_id", user.id)
          .single();

        if (!teamMember) {
          return NextResponse.json(
            { error: "Access denied" },
            { status: 403 }
          );
        }
      } else {
        return NextResponse.json(
          { error: "Job not found" },
          { status: 404 }
        );
      }
    }

    // Get crew member if user is a crew member
    const { data: crewMember } = await supabase
      .from("crew_members")
      .select("id")
      .eq("user_id", user.id)
      .single();

    // Insert communication
    const { data: communication, error: insertError } = await supabase
      .from("crew_communications")
      .insert({
        job_id,
        from_crew_member_id: crewMember?.id || null,
        to_user_id: to_user_id || null,
        message_type,
        message: message || null,
        voice_note_url: voice_note_url || null,
        photo_urls: photo_urls ? (Array.isArray(photo_urls) ? photo_urls : [photo_urls]) : [],
        is_urgent,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting communication:", insertError);
      return NextResponse.json(
        { error: insertError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ communication }, { status: 201 });
  } catch (error: any) {
    console.error("Error in communications post endpoint:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

// PATCH: Mark communication as read
export async function PATCH(req: NextRequest) {
  try {
    const supabase = createClient();

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

    const body = await req.json();
    const { communication_id } = body;

    if (!communication_id) {
      return NextResponse.json(
        { error: "Missing required field: communication_id" },
        { status: 400 }
      );
    }

    // Update read_at
    const { data: communication, error: updateError } = await supabase
      .from("crew_communications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", communication_id)
      .eq("to_user_id", user.id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating communication:", updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ communication }, { status: 200 });
  } catch (error: any) {
    console.error("Error in communications patch endpoint:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}





















