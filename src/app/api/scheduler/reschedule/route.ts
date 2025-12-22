import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/scheduler/reschedule
 * Re-schedule an existing appointment with intelligent alternatives
 * Body:
 * {
 *   booking_id: uuid (required)
 *   new_start_time?: ISO string (optional - if not provided, will suggest alternatives)
 *   preferred_date?: YYYY-MM-DD (optional)
 *   reason?: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = getServerSupabase();
    const supabaseAdmin = createServiceClient();

    const body = await req.json();
    const { booking_id, new_start_time, preferred_date, reason } = body;

    if (!booking_id) {
      return NextResponse.json(
        { error: "booking_id is required" },
        { status: 400 }
      );
    }

    // Get original booking
    const { data: originalBooking, error: fetchError } = await supabase
      .from("schedule_bookings")
      .select("*")
      .eq("id", booking_id)
      .eq("workspace_id", workspace_id)
      .single();

    if (fetchError || !originalBooking) {
      return NextResponse.json(
        { error: "Booking not found" },
        { status: 404 }
      );
    }

    // If new_start_time provided, update directly
    if (new_start_time) {
      const newStart = new Date(new_start_time);
      const duration = originalBooking.duration || 30;
      const newEnd = new Date(newStart.getTime() + duration * 60000);

      // Check for conflicts
      const { data: conflict } = await supabaseAdmin.rpc("detect_appointment_conflict", {
        p_workspace_id: workspace_id,
        p_start_time: new_start_time,
        p_end_time: newEnd.toISOString(),
        p_exclude_booking_id: booking_id,
      });

      if (conflict && conflict[0]?.conflict_exists) {
        return NextResponse.json(
          {
            error: "Conflict detected",
            conflict_type: conflict[0].conflict_type,
            conflicting_booking_id: conflict[0].conflicting_booking_id,
            alternatives: await getAlternatives(workspace_id, booking_id, preferred_date),
          },
          { status: 409 }
        );
      }

      // Update booking
      const { data: updatedBooking, error: updateError } = await supabaseAdmin
        .from("schedule_bookings")
        .update({
          start_time: new_start_time,
          end_time: newEnd.toISOString(),
          rescheduled_from_booking_id: booking_id,
          conflict_resolved: true,
          conflict_resolution_action: "shifted",
          updated_at: new Date().toISOString(),
        })
        .eq("id", booking_id)
        .select("*")
        .single();

      if (updateError) {
        console.error("Error updating booking:", updateError);
        return NextResponse.json(
          { error: "Failed to reschedule booking", details: updateError.message },
          { status: 500 }
        );
      }

      // Recalculate travel time and quality score
      if (originalBooking.property_address) {
        // Find previous appointment
        const { data: previousBooking } = await supabase
          .from("schedule_bookings")
          .select("id, property_address, end_time")
          .eq("workspace_id", workspace_id)
          .eq("status", "booked")
          .lt("start_time", new_start_time)
          .gte("start_time", new Date(newStart.toISOString().split("T")[0]).toISOString())
          .neq("id", booking_id)
          .order("start_time", { ascending: false })
          .limit(1)
          .single();

        if (previousBooking) {
          const travelResponse = await fetch(`${req.nextUrl.origin}/api/scheduler/travelTime`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-workspace-id": workspace_id,
            },
            body: JSON.stringify({
              from_address: previousBooking.property_address,
              to_address: originalBooking.property_address,
            }),
          });

          if (travelResponse.ok) {
            const travelData = await travelResponse.json();
            await supabaseAdmin
              .from("schedule_bookings")
              .update({
                travel_time_from_previous: travelData.travel_time_minutes,
                previous_appointment_id: previousBooking.id,
              })
              .eq("id", booking_id);
          }
        }
      }

      // Recalculate quality score
      await supabaseAdmin.rpc("calculate_appointment_quality_score", {
        p_booking_id: booking_id,
      });

      // Notify homeowner (TODO: implement notification)
      // await notifyHomeowner(originalBooking, updatedBooking, reason);

      return NextResponse.json({
        success: true,
        booking: updatedBooking,
        message: "Appointment rescheduled successfully",
      });
    } else {
      // Get alternatives
      const alternatives = await getAlternatives(workspace_id, booking_id, preferred_date);

      return NextResponse.json({
        booking: originalBooking,
        alternatives,
        message: "Please select a new time from the alternatives below",
      });
    }
  } catch (error: any) {
    console.error("Error in reschedule endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

async function getAlternatives(
  workspace_id: string,
  booking_id: string,
  preferred_date?: string
): Promise<any[]> {
  const supabaseAdmin = createServiceClient();

  const { data: alternatives, error } = await supabaseAdmin.rpc("get_reschedule_alternatives", {
    p_booking_id: booking_id,
    p_preferred_date: preferred_date || null,
    p_max_alternatives: 3,
  });

  if (error) {
    console.error("Error fetching alternatives:", error);
    return [];
  }

  return (alternatives || []).map((alt: any) => ({
    start_time: alt.start_time,
    end_time: alt.end_time,
    quality_score: alt.quality_score,
    travel_time_from_previous: alt.travel_time_from_previous,
    rank: alt.rank,
    formatted_time: new Date(alt.start_time).toLocaleString(),
  }));
}





















































