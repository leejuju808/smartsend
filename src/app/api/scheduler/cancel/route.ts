import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

/**
 * POST /api/scheduler/cancel
 * Cancel an appointment
 * Body:
 * {
 *   booking_id: uuid (required)
 *   reason?: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = getServerSupabase();

    const body = await req.json();
    const { booking_id, reason } = body;

    if (!booking_id) {
      return NextResponse.json(
        { error: "booking_id is required" },
        { status: 400 }
      );
    }

    // Verify booking belongs to workspace
    const { data: booking, error: fetchError } = await supabase
      .from("schedule_bookings")
      .select("*")
      .eq("id", booking_id)
      .eq("workspace_id", workspace_id)
      .single();

    if (fetchError || !booking) {
      return NextResponse.json(
        { error: "Booking not found or access denied" },
        { status: 404 }
      );
    }

    // Check if booking can be cancelled
    if (booking.status === "cancelled") {
      return NextResponse.json(
        { error: "Booking is already cancelled" },
        { status: 400 }
      );
    }

    if (booking.status === "completed") {
      return NextResponse.json(
        { error: "Cannot cancel a completed appointment" },
        { status: 400 }
      );
    }

    // Cancel the booking
    const { data: updatedBooking, error: updateError } = await supabase
      .from("schedule_bookings")
      .update({
        status: "cancelled",
        notes: reason
          ? `${booking.notes || ""}\n\nCancelled: ${reason}`.trim()
          : booking.notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", booking_id)
      .select()
      .single();

    if (updateError) {
      console.error("Error cancelling booking:", updateError);
      return NextResponse.json(
        { error: "Failed to cancel booking", details: updateError.message },
        { status: 500 }
      );
    }

    // TODO: Send cancellation email
    // TODO: Update contact next_appointment_at if this was their next appointment

    return NextResponse.json({
      success: true,
      booking: updatedBooking,
    });
  } catch (error: any) {
    console.error("Error in cancel endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}





















































