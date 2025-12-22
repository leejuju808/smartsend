import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/public/schedule/[company]
 * Get public booking page info by company slug
 * No authentication required
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { company: string } }
) {
  try {
    const supabase = createServiceClient();
    const { company } = params;

    // Get workspace by company slug
    const { data: availability, error } = await supabase
      .from("schedule_availability")
      .select(`
        *,
        workspaces (
          id,
          name
        )
      `)
      .eq("company_slug", company)
      .single();

    if (error || !availability) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    // Get appointment types for this workspace
    const { data: appointmentTypes } = await supabase
      .from("schedule_appointment_types")
      .select("*")
      .eq("workspace_id", availability.workspace_id)
      .eq("enabled", true)
      .order("display_name");

    return NextResponse.json({
      company: {
        slug: company,
        name: availability.company_name || availability.workspaces?.name,
        logo_url: availability.company_logo_url,
        intro_text: availability.booking_intro_text,
      },
      appointment_types: appointmentTypes || [],
      settings: {
        time_between_appointments: availability.time_between_appointments,
        max_appointments_per_day: availability.max_appointments_per_day,
        default_appointment_duration: availability.default_appointment_duration,
      },
    });
  } catch (error: any) {
    console.error("Error in public schedule GET endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/public/schedule/[company]
 * Book an appointment (public, no auth required)
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
export async function POST(
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

    const body = await req.json();
    const {
      appointment_type,
      start_time,
      homeowner_name,
      homeowner_email,
      homeowner_phone,
      property_address,
      notes,
      // v2 fields
      roof_issue_type, // from self-booking form
      has_leaks,
      recent_storms,
      insurance_claim_filed,
      last_inspection_date,
      issue_description,
      photo_urls = [],
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

    // Create booking using the database function
    const { data: bookingId, error: bookingError } = await supabase.rpc(
      "create_appointment_booking",
      {
        p_workspace_id: availability.workspace_id,
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
    const { data: booking, error: fetchError } = await supabase
      .from("schedule_bookings")
      .select("*")
      .eq("id", bookingId)
      .single();

    if (fetchError || !booking) {
      console.error("Error fetching booking:", fetchError);
      return NextResponse.json(
        { error: "Booking created but failed to fetch details" },
        { status: 500 }
      );
    }

    // Update booking with v2 fields
    const v2Updates: Record<string, any> = {
      booking_source: "self_booking",
    };
    if (roof_issue_type) {
      v2Updates.roof_type_guess = roof_issue_type;
    }

    await supabase
      .from("schedule_bookings")
      .update(v2Updates)
      .eq("id", bookingId);

    // Create appointment form if v2 fields provided
    if (
      has_leaks !== undefined ||
      recent_storms !== undefined ||
      insurance_claim_filed !== undefined ||
      roof_issue_type ||
      issue_description ||
      photo_urls.length > 0
    ) {
      await supabase.from("appointment_forms").insert({
        booking_id: bookingId,
        workspace_id: availability.workspace_id,
        has_leaks: has_leaks ?? null,
        recent_storms: recent_storms ?? null,
        insurance_claim_filed: insurance_claim_filed ?? null,
        last_inspection_date: last_inspection_date || null,
        roof_issue_type: roof_issue_type || null,
        issue_description: issue_description || null,
        photo_urls: JSON.stringify(photo_urls),
      });
    }

    // Pipeline sync happens automatically via trigger
    await supabase.rpc("sync_appointment_to_pipeline", {
      p_booking_id: bookingId,
    });

    // Create booking confirmation reminder
    const { data: settings } = await supabase
      .from("scheduler_settings")
      .select("send_booking_confirmation")
      .eq("workspace_id", availability.workspace_id)
      .single();

    if (settings?.send_booking_confirmation !== false) {
      await supabase.from("appointment_reminders").insert({
        booking_id: bookingId,
        workspace_id: availability.workspace_id,
        reminder_type: "booking_confirmation",
        sent_via: "email",
        email_sent: false,
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
    console.error("Error in public schedule POST endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

