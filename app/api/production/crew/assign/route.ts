// Block 246000 — Assign Crew to Job API
// POST /api/production/crew/assign

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

    const { job_id, crew_id, start_date, notes } = await req.json();

    if (!job_id || !crew_id) {
      return NextResponse.json(
        { error: "job_id and crew_id are required" },
        { status: 400 }
      );
    }

    // Update job with crew assignment
    const { data: job, error: updateError } = await supabase
      .from("roofing_jobs")
      .update({
        crew_id: crew_id,
        scheduled_start_date: start_date || undefined,
        status: start_date ? "scheduled" : undefined,
        notes: notes || undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job_id)
      .eq("workspace_id", workspaceId)
      .select()
      .single();

    if (updateError) {
      console.error("Error assigning crew:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Get crew info
    const { data: crew } = await supabase
      .from("crews")
      .select("id, name, foreman_name")
      .eq("id", crew_id)
      .single();

    // Log production event
    await supabase.from("production_events").insert({
      workspace_id: workspaceId,
      job_id: job_id,
      crew_id: crew_id,
      user_id: user.id,
      event_type: "crew_assigned",
      message: `Crew ${crew?.name || crew_id} assigned to job`,
      details: { crew_name: crew?.name, foreman: crew?.foreman_name, start_date, notes },
    });

    return NextResponse.json({ success: true, job, crew });
  } catch (error: any) {
    console.error("Error in POST /api/production/crew/assign:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























