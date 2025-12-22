import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/public/schedule/[company]/availability
 * Get available time slots for a company (public, no auth required)
 * Query params:
 * - date: YYYY-MM-DD (required)
 * - duration: minutes (default: 30)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { company: string } }
) {
  try {
    const supabase = createServiceClient();
    const { company } = params;

    // Get workspace by company slug
    const { data: availability, error: availabilityError } = await supabase
      .from("schedule_availability")
      .select("workspace_id")
      .eq("company_slug", company)
      .single();

    if (availabilityError || !availability) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

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
      p_workspace_id: availability.workspace_id,
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
      company,
      date: dateStr,
      duration,
      slots: slots || [],
    });
  } catch (error: any) {
    console.error("Error in public availability endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}





















































