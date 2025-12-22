// Block 18400 — Calendar Slots API
// GET /api/calendar/slots — Get available time slots with AI availability logic

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get workspace ID
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get query parameters
    const searchParams = req.nextUrl.searchParams;
    const dateParam = searchParams.get("date");
    const durationParam = searchParams.get("duration");
    const propertyAddress = searchParams.get("property_address");
    const appointmentType = searchParams.get("appointment_type");
    const userId = searchParams.get("user_id"); // For crew-level scheduling
    const contactId = searchParams.get("contact_id");

    // Validate required parameters
    if (!dateParam) {
      return NextResponse.json(
        { error: "date parameter is required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const date = new Date(dateParam);
    if (isNaN(date.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format. Use YYYY-MM-DD" },
        { status: 400 }
      );
    }

    const duration = durationParam ? parseInt(durationParam, 10) : 30;
    if (isNaN(duration) || duration < 15 || duration > 180) {
      return NextResponse.json(
        { error: "Duration must be between 15 and 180 minutes" },
        { status: 400 }
      );
    }

    // Call database function to get real availability
    const { data: slots, error: slotsError } = await supabase.rpc(
      "calculate_real_availability",
      {
        p_workspace_id: workspaceId,
        p_date: dateParam,
        p_duration: duration,
        p_property_address: propertyAddress || null,
        p_appointment_type: appointmentType || null,
        p_user_id: userId || null,
      }
    );

    if (slotsError) {
      console.error("[Calendar Slots] Database error:", slotsError);
      return NextResponse.json(
        { error: "Failed to calculate availability", details: slotsError.message },
        { status: 500 }
      );
    }

    // Filter to only available slots
    const availableSlots = (slots || []).filter((slot: any) => slot.available);

    // Sort by quality score (highest first), then by start time
    availableSlots.sort((a: any, b: any) => {
      if (b.quality_score !== a.quality_score) {
        return (b.quality_score || 0) - (a.quality_score || 0);
      }
      return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
    });

    return NextResponse.json({
      date: dateParam,
      duration,
      total_slots: availableSlots.length,
      slots: availableSlots.map((slot: any) => ({
        start_time: slot.start_time,
        end_time: slot.end_time,
        quality_score: slot.quality_score,
        travel_time_minutes: slot.travel_time_minutes,
        weather_safe: slot.weather_safe,
        daylight_safe: slot.daylight_safe,
        crew_available: slot.crew_available,
        reason: slot.reason,
      })),
    });
  } catch (error: any) {
    console.error("[Calendar Slots] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































