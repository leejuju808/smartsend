import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/scheduler/book
 * Book an appointment
 * Body:
 * {
 *   appointment_type: string (required)
 *   start_time: ISO string (required)
 *   homeowner_name: string (required)
 *   homeowner_email: string (required)
 *   homeowner_phone?: string
 *   property_address: string (required)
 *   notes?: string
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
    const {
      appointment_type,
      start_time,
      homeowner_name,
      homeowner_email,
      homeowner_phone,
      property_address,
      notes,
      booking_source = "manual", // v2: 'manual' | 'self_booking' | 'ai_recommendation' | 'sms_reply' | 'email_reply'
      assigned_to_user_id, // v2: optional user assignment
      travel_time_minutes, // v2: pre-calculated travel time
      estimated_job_value, // v2: estimated job value
      roof_issue_type, // v2: from self-booking form
    } = body;

    // Validation
    if (!appointment_type || !start_time || !homeowner_name || !homeowner_email || !property_address) {
      return NextResponse.json(
        { error: "Missing required fields: appointment_type, start_time, homeowner_name, homeowner_email, property_address" },
        { status: 400 }
      );
    }

    // Validate appointment type
    const validTypes = [
      "roof_inspection",
      "leak_check",
      "full_roof_estimate",
      "insurance_inspection",
      "storm_damage_assessment",
      "gutter_roof_check",
    ];
    if (!validTypes.includes(appointment_type)) {
      return NextResponse.json(
        { error: `Invalid appointment_type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate start_time
    const startTime = new Date(start_time);
    if (isNaN(startTime.getTime())) {
      return NextResponse.json(
        { error: "Invalid start_time format. Use ISO 8601 string" },
        { status: 400 }
      );
    }

    // Check if time is in the past
    if (startTime < new Date()) {
      return NextResponse.json(
        { error: "Cannot book appointments in the past" },
        { status: 400 }
      );
    }

    // Get appointment duration first
    const { data: appointmentType } = await supabase
      .from("schedule_appointment_types")
      .select("duration")
      .eq("workspace_id", workspace_id)
      .eq("type_key", appointment_type)
      .eq("enabled", true)
      .single();

    const duration = appointmentType?.duration || 30;
    const endTime = new Date(startTime.getTime() + duration * 60000).toISOString();

    // Check conflict with calculated end time
    const { data: conflict } = await supabaseAdmin.rpc("detect_appointment_conflict", {
      p_workspace_id: workspace_id,
      p_start_time: start_time,
      p_end_time: endTime,
      p_exclude_booking_id: null,
    });

    if (conflict && conflict[0]?.conflict_exists) {
      return NextResponse.json(
        {
          error: "Conflict detected",
          conflict_type: conflict[0].conflict_type,
          conflicting_booking_id: conflict[0].conflicting_booking_id,
          message: "This time slot conflicts with an existing appointment. Please choose another time.",
        },
        { status: 409 }
      );
    }

    // Calculate travel time if property address provided (Block 17500)
    let calculatedTravelTime: number | null = null;
    let travelTimeFromOffice: number | null = null;
    let previousAppointmentId: string | null = null;

    if (property_address) {
      // Get scheduler settings for office address
      const { data: schedulerSettings } = await supabase
        .from("scheduler_settings")
        .select("office_address")
        .eq("workspace_id", workspace_id)
        .single();

      // Find previous appointment on same day
      const { data: previousBooking } = await supabase
        .from("schedule_bookings")
        .select("id, property_address, end_time")
        .eq("workspace_id", workspace_id)
        .eq("status", "booked")
        .lt("start_time", start_time)
        .gte("start_time", new Date(startTime.toISOString().split("T")[0]).toISOString())
        .order("start_time", { ascending: false })
        .limit(1)
        .single();

      if (previousBooking) {
        previousAppointmentId = previousBooking.id;
        // Calculate travel time from previous appointment
        const travelResponse = await fetch(`${req.nextUrl.origin}/api/scheduler/travelTime`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-workspace-id": workspace_id,
          },
          body: JSON.stringify({
            from_address: previousBooking.property_address,
            to_address: property_address,
          }),
        });

        if (travelResponse.ok) {
          const travelData = await travelResponse.json();
          calculatedTravelTime = travelData.travel_time_minutes;
        }
      }

      // Calculate travel time from office if available
      if (schedulerSettings?.office_address) {
        const officeTravelResponse = await fetch(`${req.nextUrl.origin}/api/scheduler/travelTime`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-workspace-id": workspace_id,
          },
          body: JSON.stringify({
            from_address: schedulerSettings.office_address,
            to_address: property_address,
          }),
        });

        if (officeTravelResponse.ok) {
          const officeTravelData = await officeTravelResponse.json();
          travelTimeFromOffice = officeTravelData.travel_time_minutes;
        }
      }
    }

    // Create booking using the database function
    const { data: bookingId, error: bookingError } = await supabaseAdmin.rpc(
      "create_appointment_booking",
      {
        p_workspace_id: workspace_id,
        p_appointment_type: appointment_type,
        p_start_time: start_time,
        p_homeowner_name: homeowner_name,
        p_homeowner_email: homeowner_email,
        p_homeowner_phone: homeowner_phone || null,
        p_property_address: property_address,
        p_notes: notes || null,
      }
    );

    if (bookingError) {
      console.error("Error creating booking:", bookingError);
      
      // Check for double booking error
      if (bookingError.message?.includes("overlapping") || bookingError.message?.includes("exclude")) {
        return NextResponse.json(
          { error: "This time slot is already booked. Please choose another time." },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: "Failed to create booking", details: bookingError.message },
        { status: 500 }
      );
    }

    // Get the full booking details
    let booking = null;
    const { data: fetchedBooking, error: fetchError } = await supabase
      .from("schedule_bookings")
      .select("*")
      .eq("id", bookingId)
      .single();

    if (fetchError || !fetchedBooking) {
      console.error("Error fetching booking:", fetchError);
      return NextResponse.json(
        { error: "Booking created but failed to fetch details" },
        { status: 500 }
      );
    }

    booking = fetchedBooking;

    // Update booking with v2 fields if provided (Block 17500 enhancements)
    const v2Updates: Record<string, any> = {};
    if (booking_source && booking_source !== "manual") {
      v2Updates.booking_source = booking_source;
    }
    if (assigned_to_user_id) {
      v2Updates.assigned_to_user_id = assigned_to_user_id;
    }
    // Use calculated travel time if available, otherwise use provided
    if (calculatedTravelTime !== null) {
      v2Updates.travel_time_from_previous = calculatedTravelTime;
      v2Updates.travel_time_minutes = calculatedTravelTime;
    } else if (travel_time_minutes) {
      v2Updates.travel_time_minutes = travel_time_minutes;
    }
    if (travelTimeFromOffice !== null) {
      v2Updates.travel_time_from_office = travelTimeFromOffice;
    }
    if (previousAppointmentId) {
      v2Updates.previous_appointment_id = previousAppointmentId;
    }
    if (estimated_job_value) {
      v2Updates.estimated_job_value = estimated_job_value;
    }
    if (roof_issue_type) {
      v2Updates.roof_type_guess = roof_issue_type;
    }
    
    // Check daylight safety
    const { data: daylightCheck } = await supabaseAdmin.rpc("is_daylight_safe", {
      p_start_time: start_time,
      p_end_time: endTime,
      p_workspace_id: workspace_id,
      p_location_address: property_address,
    });
    v2Updates.daylight_safe = daylightCheck || true;

    if (Object.keys(v2Updates).length > 0) {
      const { data: updatedBooking, error: updateError } = await supabaseAdmin
        .from("schedule_bookings")
        .update(v2Updates)
        .eq("id", bookingId)
        .select("*")
        .single();

      if (!updateError && updatedBooking) {
        booking = updatedBooking;
      }
    }

    // Assign crew member if not already assigned (Block 17500)
    if (!assigned_to_user_id && property_address) {
      const { data: assignedUserId } = await supabaseAdmin.rpc("assign_crew_to_appointment", {
        p_booking_id: bookingId,
        p_property_address: property_address,
        p_preferred_user_id: null,
      });
      
      if (assignedUserId) {
        await supabaseAdmin
          .from("schedule_bookings")
          .update({ assigned_to_user_id: assignedUserId })
          .eq("id", bookingId);
      }
    }

    // Calculate quality score (Block 17500)
    const { data: qualityScore } = await supabaseAdmin.rpc("calculate_appointment_quality_score", {
      p_booking_id: bookingId,
    });

    // Pipeline sync happens automatically via trigger, but we can also call it explicitly
    await supabaseAdmin.rpc("sync_appointment_to_pipeline", {
      p_booking_id: bookingId,
    });

    // Send booking confirmation if enabled (v2)
    const { data: settings } = await supabase
      .from("scheduler_settings")
      .select("send_booking_confirmation")
      .eq("workspace_id", workspace_id)
      .single();

    if (settings?.send_booking_confirmation !== false) {
      // TODO: Send confirmation email/SMS (implemented in reminder system)
      // For now, create reminder record
      await supabaseAdmin.from("appointment_reminders").insert({
        booking_id: bookingId,
        workspace_id,
        reminder_type: "booking_confirmation",
        sent_via: "email", // Will be enhanced to support SMS
        email_sent: false, // Will be set to true after sending
      });
    }

    return NextResponse.json({
      success: true,
      booking: {
        id: booking.id,
        appointment_type: booking.appointment_type,
        start_time: booking.start_time,
        end_time: booking.end_time,
        homeowner_name: booking.homeowner_name,
        homeowner_email: booking.homeowner_email,
        property_address: booking.property_address,
        status: booking.status,
      },
    });
  } catch (error: any) {
    console.error("Error in book endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

