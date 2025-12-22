import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

// POST /api/leads/merge/undo - Undo a merge
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id, user } = gate;
    const supabase = createClient();
    const body = await req.json();
    const { merge_event_id } = body;

    if (!merge_event_id) {
      return NextResponse.json(
        { error: "merge_event_id is required" },
        { status: 400 }
      );
    }

    // Verify user has admin/owner role
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json(
        { error: "Only owners and admins can undo merges" },
        { status: 403 }
      );
    }

    // Verify merge event exists and is in workspace
    const { data: mergeEvent, error: eventError } = await supabase
      .from("lead_merge_events")
      .select("id, workspace_id, merged_at, undone_at")
      .eq("id", merge_event_id)
      .single();

    if (eventError || !mergeEvent) {
      return NextResponse.json(
        { error: "Merge event not found" },
        { status: 404 }
      );
    }

    if (mergeEvent.workspace_id !== workspace_id) {
      return NextResponse.json(
        { error: "Merge event not in this workspace" },
        { status: 403 }
      );
    }

    if (mergeEvent.undone_at) {
      return NextResponse.json(
        { error: "Merge has already been undone" },
        { status: 400 }
      );
    }

    // Check if merge is within 7 days
    const mergeDate = new Date(mergeEvent.merged_at);
    const now = new Date();
    const daysDiff = (now.getTime() - mergeDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff > 7) {
      return NextResponse.json(
        { error: "Cannot undo merge after 7 days" },
        { status: 400 }
      );
    }

    // Call undo function
    const { error: undoError } = await supabase.rpc("undo_lead_merge", {
      p_merge_event_id: merge_event_id,
      p_undone_by: user.id,
    });

    if (undoError) {
      return NextResponse.json(
        { error: undoError.message || "Failed to undo merge" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Merge undone successfully",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}








