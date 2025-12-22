// Block 255400 — Field Operations Command v1
// API Route: Update Punchlist Item
// PATCH /api/field-ops/punchlist/[id]

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id } = await params;

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
      status,
      completion_photos,
      waived_reason,
    } = body;

    // Get existing punchlist item
    const { data: existingItem, error: fetchError } = await supabase
      .from("punchlists")
      .select("*, job_id")
      .eq("id", id)
      .single();

    if (fetchError || !existingItem) {
      return NextResponse.json(
        { error: "Punchlist item not found" },
        { status: 404 }
      );
    }

    // Verify job access
    const { data: job } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", existingItem.job_id)
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
        .eq("id", existingItem.job_id)
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

    // Build update object
    const updateData: any = {};

    if (status) {
      updateData.status = status;
      if (status === "completed") {
        updateData.completed_at = new Date().toISOString();
        updateData.completed_by = crewMember?.id || null;
      }
      if (status === "waived") {
        updateData.waived_at = new Date().toISOString();
        updateData.waived_by = user.id;
        updateData.waived_reason = waived_reason || null;
      }
    }

    if (completion_photos) {
      updateData.completion_photos = Array.isArray(completion_photos)
        ? completion_photos
        : [completion_photos];
    }

    // Update punchlist item
    const { data: updatedItem, error: updateError } = await supabase
      .from("punchlists")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating punchlist:", updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ punchlist: updatedItem }, { status: 200 });
  } catch (error: any) {
    console.error("Error in punchlist patch endpoint:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}





















