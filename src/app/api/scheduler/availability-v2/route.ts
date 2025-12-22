import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

/**
 * GET /api/scheduler/availability-v2
 * Get weather-aware available time slots for a date
 * Query params:
 * - date: YYYY-MM-DD (required)
 * - duration: minutes (default: 15)
 * - location_address: optional address for weather filtering
 * - location_zip: optional zip for weather filtering
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = getServerSupabase();

    const searchParams = req.nextUrl.searchParams;
    const dateStr = searchParams.get("date");
    const duration = parseInt(searchParams.get("duration") || "15", 10);
    const locationAddress = searchParams.get("location_address");
    const locationZip = searchParams.get("location_zip");

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

    // Call the weather-aware database function
    const { data: slots, error } = await supabase.rpc("get_weather_aware_time_slots", {
      p_workspace_id: workspace_id,
      p_date: dateStr,
      p_duration: duration,
      p_location_address: locationAddress || null,
      p_location_zip: locationZip || null,
    });

    if (error) {
      console.error("Error fetching weather-aware slots:", error);
      return NextResponse.json(
        { error: "Failed to fetch available slots", details: error.message },
        { status: 500 }
      );
    }

    // Filter to only weather-safe slots by default
    const safeSlots = (slots || []).filter((slot: any) => slot.weather_safe);

    return NextResponse.json({
      date: dateStr,
      duration,
      slots: safeSlots.map((slot: any) => ({
        start_time: slot.start_time,
        end_time: slot.end_time,
        weather_safe: slot.weather_safe,
        weather_warning: slot.weather_warning,
      })),
      all_slots: slots || [], // Include unsafe slots for reference
    });
  } catch (error: any) {
    console.error("Error in availability-v2 endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}





















































