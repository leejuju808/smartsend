// Block 246000 — Update Job Status API
// POST /api/production/job/status

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export async function POST(req: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const { job_id, status, notes } = await req.json();

    if (!job_id || !status) {
      return NextResponse.json(
        { error: "job_id and status are required" },
        { status: 400 }
      );
    }

    // Validate status
    const validStatuses = ["unscheduled", "scheduled", "in_progress", "completed", "cancelled"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    // Update job status
    const { data: job, error: updateError } = await supabase
      .from("roofing_jobs")
      .update({
        status,
        notes: notes || undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job_id)
      .eq("workspace_id", workspaceId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating job status:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Log production event
    const eventType = status === "in_progress" ? "job_started" :
                     status === "completed" ? "job_completed" :
                     status === "scheduled" ? "schedule_updated" :
                     "other";

    await supabase.from("production_events").insert({
      workspace_id: workspaceId,
      job_id: job_id,
      user_id: user.id,
      event_type: eventType,
      message: `Job status changed to ${status}`,
      details: { status, previous_status: job?.status, notes },
    });

    return NextResponse.json({ success: true, job });
  } catch (error: any) {
    console.error("Error in POST /api/production/job/status:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























