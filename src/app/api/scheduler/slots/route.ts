import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

/**
 * GET /api/scheduler/slots
 * Get smart available slots with travel time, weather, and quality scoring
 * Query params:
 * - date: YYYY-MM-DD (required)
 * - duration: minutes (default: 30)
 * - property_address?: string (for travel time calculation)
 * - appointment_type?: string
 * - contact_id?: uuid (for lead priority)
 * - exclude_booking_id?: uuid (for re-scheduling)
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
    const propertyAddress = searchParams.get("property_address");
    const appointmentType = searchParams.get("appointment_type");
    const contactId = searchParams.get("contact_id");
    const excludeBookingId = searchParams.get("exclude_booking_id");

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

    // Get smart available slots
    const { data: slots, error } = await supabase.rpc("get_smart_available_slots", {
      p_workspace_id: workspace_id,
      p_date: dateStr,
      p_duration: duration,
      p_property_address: propertyAddress || null,
      p_appointment_type: appointmentType || null,
      p_contact_id: contactId || null,
      p_exclude_booking_id: excludeBookingId || null,
    });

    if (error) {
      console.error("Error fetching smart slots:", error);
      return NextResponse.json(
        { error: "Failed to fetch available slots", details: error.message },
        { status: 500 }
      );
    }

    // Format response
    const formattedSlots = (slots || []).map((slot: any) => ({
      start_time: slot.start_time,
      end_time: slot.end_time,
      travel_time_from_previous: slot.travel_time_from_previous,
      travel_time_from_office: slot.travel_time_from_office,
      quality_score: slot.quality_score,
      quality_category: slot.quality_category,
      weather_safe: slot.weather_safe,
      daylight_safe: slot.daylight_safe,
      available: slot.available,
      reason: slot.reason,
    }));

    return NextResponse.json({
      date: dateStr,
      duration,
      slots: formattedSlots,
      total_available: formattedSlots.filter((s: any) => s.available).length,
      optimal_slots: formattedSlots.filter((s: any) => s.quality_category === "optimal").length,
      good_slots: formattedSlots.filter((s: any) => s.quality_category === "good").length,
      risky_slots: formattedSlots.filter((s: any) => s.quality_category === "risky").length,
    });
  } catch (error: any) {
    console.error("Error in slots endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}





















































