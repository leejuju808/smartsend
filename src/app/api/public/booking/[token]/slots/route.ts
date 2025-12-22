// Block 33602 — Get Available Slots for Booking Link
// Returns available time slots for a booking token

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;
    const searchParams = req.nextUrl.searchParams;
    const dateStr = searchParams.get("date");
    const duration = parseInt(searchParams.get("duration") || "45", 10);

    if (!dateStr) {
      return NextResponse.json(
        { error: "date parameter is required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Validate booking link
    const { data: bookingLink } = await supabase
      .from("booking_links")
      .select("contractor_id, expires_at, used_at")
      .eq("token", token)
      .single();

    if (!bookingLink) {
      return NextResponse.json(
        { error: "Invalid booking link" },
        { status: 404 }
      );
    }

    if (bookingLink.expires_at && new Date(bookingLink.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Booking link has expired" },
        { status: 410 }
      );
    }

    if (bookingLink.used_at) {
      return NextResponse.json(
        { error: "Booking link already used" },
        { status: 410 }
      );
    }

    // Get available slots using database function
    const { data: slots, error: slotsError } = await supabase.rpc(
      "get_available_slots",
      {
        p_contractor_id: bookingLink.contractor_id,
        p_date: dateStr,
        p_duration_minutes: duration,
      }
    );

    if (slotsError) {
      console.error("Error fetching slots:", slotsError);
      return NextResponse.json(
        { error: "Failed to fetch available slots" },
        { status: 500 }
      );
    }

    // Filter to only available slots
    const availableSlots = (slots || []).filter((slot: any) => slot.available);

    return NextResponse.json({
      date: dateStr,
      duration,
      slots: availableSlots.map((slot: any) => ({
        start_time: slot.start_time,
        end_time: slot.end_time,
      })),
    });
  } catch (error: any) {
    console.error("Error in booking slots GET:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

































