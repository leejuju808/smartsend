// Block 83000 — SmartSend Roofing Homeowner Portal v1
// API Route: Manage Portal Events
// POST /api/homeowner-portal/[jobId]/events

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
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

    const body = await req.json();
    const { event_type, title, description } = body;

    if (!event_type || !title) {
      return NextResponse.json(
        { error: "event_type and title are required" },
        { status: 400 }
      );
    }

    // Verify job exists and user has access
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

    // Verify user has access to workspace
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

    // Get portal
    const { data: portal } = await supabase
      .from("homeowner_portals")
      .select("id")
      .eq("job_id", jobId)
      .eq("is_active", true)
      .single();

    if (!portal) {
      return NextResponse.json(
        { error: "Portal not found. Create portal first." },
        { status: 404 }
      );
    }

    // Create event
    const { data: event, error: eventError } = await supabase
      .from("homeowner_portal_events")
      .insert({
        portal_id: portal.id,
        job_id: jobId,
        event_type,
        title,
        description,
      })
      .select()
      .single();

    if (eventError) {
      console.error("Error creating event:", eventError);
      return NextResponse.json(
        { error: eventError.message || "Failed to create event" },
        { status: 500 }
      );
    }

    return NextResponse.json({ event }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating event:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























