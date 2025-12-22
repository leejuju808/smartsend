// Block 90000 — Production Calendar Conflict Detection API
// GET /api/production-calendar/conflicts?workspace_id=uuid&from=YYYY-MM-DD&to=YYYY-MM-DD

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
    const workspace_id = searchParams.get("workspace_id");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!workspace_id) {
      return NextResponse.json(
        { error: "workspace_id is required" },
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

    // Get all calendar events in date range
    let query = supabase
      .from("calendar_events")
      .select("id, crew_id, start_time, end_time, job_id, title, event_type")
      .eq("workspace_id", workspace_id)
      .in("status", ["scheduled", "in_progress"]);

    if (from) {
      query = query.gte("start_time", `${from}T00:00:00`);
    }
    if (to) {
      query = query.lte("start_time", `${to}T23:59:59`);
    }

    const { data: events, error } = await query;

    if (error) throw error;

    // Detect conflicts
    const conflicts: any[] = [];

    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const event1 = events[i];
        const event2 = events[j];

        // Check for crew double-booking
        if (
          event1.crew_id &&
          event2.crew_id &&
          event1.crew_id === event2.crew_id
        ) {
          const start1 = new Date(event1.start_time);
          const end1 = new Date(event1.end_time || event1.start_time);
          const start2 = new Date(event2.start_time);
          const end2 = new Date(event2.end_time || event2.start_time);

          // Check for overlap
          if (
            (start1 <= start2 && end1 > start2) ||
            (start2 <= start1 && end2 > start1) ||
            (start1 >= start2 && end1 <= end2) ||
            (start2 >= start1 && end2 <= end1)
          ) {
            conflicts.push({
              conflict_type: "crew_double_booked",
              severity: "critical",
              message: `Crew is double-booked: ${event1.title} and ${event2.title}`,
              event_id_1: event1.id,
              event_id_2: event2.id,
              crew_id: event1.crew_id,
            });
          }
        }
      }
    }

    return NextResponse.json({ conflicts });
  } catch (error: any) {
    console.error("Error detecting conflicts:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
