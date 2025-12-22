// Block 22750 — SmartSend Roofing Field App v1
// API Route: Add Field Notes
// POST /api/field/notes

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    const { job_id, workspace_id, field_session_id, crew_id, note_type, content } = await req.json();

    if (!job_id || !workspace_id || !content) {
      return NextResponse.json(
        { error: "job_id, workspace_id, and content required" },
        { status: 400 }
      );
    }

    // Verify user has access to this workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Insert field note
    const { data: note, error: noteError } = await supabase
      .from("job_field_notes")
      .insert({
        workspace_id,
        job_id,
        field_session_id: field_session_id || null,
        crew_id: crew_id || null,
        user_id: user.id,
        note_type: note_type || "general",
        content,
      })
      .select()
      .single();

    if (noteError) {
      console.error("Error creating field note:", noteError);
      return NextResponse.json(
        { error: noteError.message || "Failed to create note" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { note, message: "Note added successfully" },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in field notes API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}







































