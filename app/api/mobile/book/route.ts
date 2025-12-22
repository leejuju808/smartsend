import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

/**
 * POST /api/mobile/book
 * Book an appointment from mobile app
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const body = await req.json();

    const {
      contact_id,
      appointment_type,
      start_time,
      homeowner_name,
      homeowner_email,
      homeowner_phone,
      property_address,
      assigned_to_user_id,
    } = body;

    if (!appointment_type || !start_time || !homeowner_name || !property_address) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const startTime = new Date(start_time);
    const endTime = new Date(startTime.getTime() + 30 * 60000); // 30 min default

    // Create booking using existing function or direct insert
    const { data: booking, error: bookingError } = await supabase
      .from("schedule_bookings")
      .insert({
        workspace_id,
        contact_id: contact_id || null,
        appointment_type,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        duration: 30,
        homeowner_name,
        homeowner_email: homeowner_email || "",
        homeowner_phone: homeowner_phone || null,
        property_address,
        status: "booked",
        confirmation_sent: false,
      })
      .select()
      .single();

    if (bookingError) {
      console.error("Booking error:", bookingError);
      return NextResponse.json(
        { error: "Failed to create booking", details: bookingError.message },
        { status: 500 }
      );
    }

    // Update contact status to "booked" if contact exists
    if (contact_id) {
      await supabase
        .from("contacts")
        .update({ lead_status: "booked" })
        .eq("id", contact_id);

      // Create timeline event
      await supabase.from("lead_timeline_events").insert({
        lead_id: contact_id,
        event_type: "status_changed",
        event_subtype: "appointment_booked",
        message: `Appointment booked for ${startTime.toLocaleDateString()} at ${startTime.toLocaleTimeString()}`,
        metadata: {
          appointment_id: booking.id,
          old_status: null,
          new_status: "booked",
        },
      });
    }

    return NextResponse.json({
      ok: true,
      booking_id: booking.id,
      message: "Appointment booked successfully",
    });
  } catch (error: any) {
    console.error("Error booking appointment:", error);
    return NextResponse.json(
      { error: "Failed to book appointment" },
      { status: 500 }
    );
  }
}






































