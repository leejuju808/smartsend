/**
 * Calendar Integration Webhook
 * 
 * Handles calendar booking events from:
 * - Google Calendar
 * - Outlook Calendar
 * - Calendly
 * - SavvyCal
 * - YouCanBookMe
 * 
 * SmartSend books dates directly.
 * Homeowners choose times → roofer sees it instantly.
 * Removes back-and-forth. Increases close rate.
 */

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      integration_id,
      workspace_id,
      event_type, // 'booking_created', 'booking_updated', 'booking_cancelled'
      booking_data
    } = body;

    if (!integration_id || !workspace_id || !event_type || !booking_data) {
      return NextResponse.json(
        { error: "Missing required fields: integration_id, workspace_id, event_type, booking_data" },
        { status: 400 }
      );
    }

    const supabase = createRouteHandlerClient({ cookies });

    // Extract booking information
    const email = booking_data.email || booking_data.Email || booking_data.attendee_email;
    const first_name = booking_data.first_name || booking_data.firstName || booking_data.FirstName;
    const last_name = booking_data.last_name || booking_data.lastName || booking_data.LastName;
    const phone = booking_data.phone || booking_data.Phone || booking_data.phone_number;
    const booking_time = booking_data.start_time || booking_data.startTime || booking_data.datetime;
    const booking_id = booking_data.booking_id || booking_data.id || booking_data.event_id;
    const notes = booking_data.notes || booking_data.description || booking_data.message;

    if (!email) {
      return NextResponse.json(
        { error: "Email is required in booking data" },
        { status: 400 }
      );
    }

    // Process lead through unified processing
    const processResponse = await fetch(
      `${req.nextUrl.origin}/api/integrations/roofing/process-lead`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cookie": req.headers.get("cookie") || ""
        },
        body: JSON.stringify({
          integration_id,
          workspace_id,
          email,
          first_name,
          last_name,
          phone,
          source_type: "calendar",
          message_text: notes || `Booking scheduled for ${booking_time}`,
          metadata: {
            event_type,
            booking_id,
            booking_time,
            raw_data: booking_data
          }
        })
      }
    );

    if (!processResponse.ok) {
      const error = await processResponse.json();
      console.error("Failed to process calendar booking:", error);
      return NextResponse.json(
        { error: "Failed to process booking" },
        { status: 500 }
      );
    }

    const result = await processResponse.json();

    // Create calendar event record (if you have a calendar_events table)
    // For now, we'll just return success

    return NextResponse.json({
      success: true,
      lead_id: result.lead_id,
      classification: result.classification,
      message: `Booking ${event_type} processed successfully`
    });

  } catch (error) {
    console.error("Error processing calendar webhook:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}






































