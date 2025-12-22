import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

/**
 * GET /api/scheduler/availability
 * Get available time slots for a date range
 * Query params:
 * - date: YYYY-MM-DD (required)
 * - duration: minutes (default: 30)
 * - workspace_id: uuid (from header or query)
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = getServerSupabase();

    const searchParams = req.nextUrl.searchParams;
    const dateStr = searchParams.get("date");
    const duration = parseInt(searchParams.get("duration") || "30", 10);

    if (!dateStr) {
      return NextResponse.json(
        { error: "Date parameter is required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format. Use YYYY-MM-DD" },
        { status: 400 }
      );
    }

    // Call the database function to get available slots
    const { data: slots, error } = await supabase.rpc("get_available_time_slots", {
      p_workspace_id: workspace_id,
      p_date: dateStr,
      p_duration: duration,
    });

    if (error) {
      console.error("Error fetching available slots:", error);
      return NextResponse.json(
        { error: "Failed to fetch available slots", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      date: dateStr,
      duration,
      slots: slots || [],
    });
  } catch (error: any) {
    console.error("Error in availability endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}





















































