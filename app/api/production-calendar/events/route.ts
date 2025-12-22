// Block 90000 — Production Calendar API
// GET /api/production-calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD&crew_id=uuid
// POST /api/production-calendar/events (create event)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const crew_id = searchParams.get("crew_id");
    const event_type = searchParams.get("event_type");

    if (!from || !to) {
      return NextResponse.json(
        { error: "from and to date parameters are required" },
        { status: 400 }
      );
    }

    // Get user's workspaces
    const { data: memberships } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id);

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ events: [] });
    }

    const workspaceIds = memberships.map((m) => m.workspace_id);

    // Build query using calendar_events table
    let query = supabase
      .from("calendar_events")
      .select(`
        *,
        jobs:roofing_jobs (
          id,
          title,
          address,
          job_value,
          official_squares
        ),
        crews (
          id,
          name,
          foreman_name
        )
      `)
      .in("workspace_id", workspaceIds)
      .gte("start_time", `${from}T00:00:00`)
      .lte("start_time", `${to}T23:59:59`)
      .order("start_time", { ascending: true });

    if (crew_id) {
      query = query.eq("crew_id", crew_id);
    }

    if (event_type) {
      query = query.eq("event_type", event_type);
    }

    const { data: events, error } = await query;

    if (error) throw error;

    // Format events with job and crew info
    const formattedEvents = (events || []).map((event: any) => ({
      id: event.id,
      workspace_id: event.workspace_id,
      job_id: event.job_id,
      crew_id: event.crew_id,
      event_type: event.event_type,
      title: event.title,
      description: event.description,
      start_time: event.start_time,
      end_time: event.end_time,
      status: event.status,
      job_title: event.jobs?.title,
      job_address: event.jobs?.address,
      crew_name: event.crews?.name,
    }));

    return NextResponse.json({ events: formattedEvents });
  } catch (error: any) {
    console.error("Error fetching production calendar events:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      workspace_id,
      job_id,
      crew_id,
      event_type,
      title,
      description,
      start_time,
      end_time,
      material_delivery_id,
    } = body;

    if (!workspace_id || !event_type || !title || !start_time) {
      return NextResponse.json(
        { error: "workspace_id, event_type, title, and start_time are required" },
        { status: 400 }
      );
    }

    // Verify workspace membership
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Check for conflicts if crew_id is provided
    if (crew_id) {
      const { data: conflicts } = await supabase.rpc("check_scheduling_conflicts", {
        p_workspace_id: workspace_id,
        p_crew_id: crew_id,
        p_start_time: start_time,
        p_end_time: end_time || start_time,
        p_job_id: job_id || null,
        p_event_id: null,
      });

      if (conflicts && conflicts.length > 0) {
        const criticalConflicts = conflicts.filter((c: any) => c.severity === "critical");
        if (criticalConflicts.length > 0) {
          return NextResponse.json(
            {
              error: "Scheduling conflict detected",
              conflicts: conflicts,
            },
            { status: 409 }
          );
        }
      }
    }

    // Create calendar event
    const { data: event, error } = await supabase
      .from("calendar_events")
      .insert({
        workspace_id,
        job_id: job_id || null,
        crew_id: crew_id || null,
        event_type,
        title,
        description: description || null,
        start_time,
        end_time: end_time || null,
        material_delivery_id: material_delivery_id || null,
        status: "scheduled",
        created_by: "user",
        created_by_user_id: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    // If this is an install event and job_id exists, notify homeowner
    if (event_type === "install" && job_id) {
      // Trigger homeowner notification (async)
      fetch(`${req.nextUrl.origin}/api/production-calendar/notify-homeowner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id,
          event_id: event.id,
          event_type: "install_scheduled",
        }),
      }).catch((err) => console.error("Failed to notify homeowner:", err));
    }

    return NextResponse.json({ event });
  } catch (error: any) {
    console.error("Error creating production calendar event:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























