import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

/**
 * GET /api/scheduler/me
 * Get roofer's schedule (bookings)
 * Query params:
 * - start_date: YYYY-MM-DD (optional, default: today)
 * - end_date: YYYY-MM-DD (optional, default: 30 days from start)
 * - status: booked|confirmed|cancelled|completed|all (default: all)
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = getServerSupabase();

    const searchParams = req.nextUrl.searchParams;
    const startDateStr = searchParams.get("start_date");
    const endDateStr = searchParams.get("end_date");
    const status = searchParams.get("status") || "all";

    // Default to today + 30 days
    const startDate = startDateStr
      ? new Date(startDateStr)
      : new Date();
    const endDate = endDateStr
      ? new Date(endDateStr)
      : new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Build query
    let query = supabase
      .from("schedule_bookings")
      .select(`
        *,
        contacts (
          id,
          email,
          first_name,
          last_name,
          phone
        )
      `)
      .eq("workspace_id", workspace_id)
      .gte("start_time", startDate.toISOString())
      .lte("start_time", endDate.toISOString())
      .order("start_time", { ascending: true });

    // Filter by status
    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data: bookings, error } = await query;

    if (error) {
      console.error("Error fetching bookings:", error);
      return NextResponse.json(
        { error: "Failed to fetch bookings", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      start_date: startDate.toISOString().split("T")[0],
      end_date: endDate.toISOString().split("T")[0],
      bookings: bookings || [],
      count: bookings?.length || 0,
    });
  } catch (error: any) {
    console.error("Error in me endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}





















































