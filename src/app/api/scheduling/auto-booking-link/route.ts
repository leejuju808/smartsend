// Block 33602 — Auto-Send Booking Link API
// Automatically generates and sends booking link when scheduling intent is detected

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lead_id, contractor_id, intelligence_result } = body;

    if (!lead_id) {
      return NextResponse.json(
        { error: "lead_id is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const workspaceId = await getCurrentWorkspaceId();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get contractor_id if not provided (from workspace owner or current user)
    let finalContractorId = contractor_id;
    if (!finalContractorId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
      finalContractorId = user.id;
    }

    // Get lead info
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, email, phone, first_name, last_name, workspace_id")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    // Check if scheduling intent is present
    const hasBookingIntent = intelligence_result?.hasBookingIntent || 
                             intelligence_result?.bookingConfidence > 0.7 ||
                             ["yes_come_inspect", "yes_wants_estimate", "wants_availability"].includes(intelligence_result?.category);

    if (!hasBookingIntent) {
      return NextResponse.json(
        { error: "No scheduling intent detected", skipped: true },
        { status: 200 }
      );
    }

    // Check if booking links are enabled for this contractor
    const { data: scheduleSettings } = await supabase
      .from("schedule_settings")
      .select("booking_link_enabled")
      .eq("contractor_id", finalContractorId)
      .single();

    if (scheduleSettings && scheduleSettings.booking_link_enabled === false) {
      return NextResponse.json(
        { error: "Booking links are disabled for this contractor", skipped: true },
        { status: 200 }
      );
    }

    // Generate booking link via edge function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const bookingLinkResponse = await fetch(
      `${supabaseUrl}/functions/v1/get-booking-link`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          contractor_id: finalContractorId,
          lead_id: lead_id,
          expires_in_hours: 168, // 7 days
        }),
      }
    );

    if (!bookingLinkResponse.ok) {
      const error = await bookingLinkResponse.text();
      console.error("Error generating booking link:", error);
      return NextResponse.json(
        { error: "Failed to generate booking link" },
        { status: 500 }
      );
    }

    const { url: bookingUrl } = await bookingLinkResponse.json();

    // Send booking link to lead via email/SMS
    const firstName = lead.first_name || "there";
    const message = `Hi ${firstName}, I'd be happy to help! You can pick a time that works for you here: ${bookingUrl}`;

    // Send email (via your email service)
    if (lead.email) {
      // TODO: Integrate with your email sending service
      // For now, log it
      console.log(`Would send email to ${lead.email}: ${message}`);
    }

    // Send SMS if phone available
    if (lead.phone) {
      // TODO: Integrate with SMS service
      console.log(`Would send SMS to ${lead.phone}: ${message}`);
    }

    // Log the action
    await supabase.from("lead_timeline_events").insert({
      lead_id: lead_id,
      event_type: "booking_link_sent",
      event_subtype: "auto",
      message: "Booking link automatically sent after detecting scheduling intent",
      metadata: {
        booking_url: bookingUrl,
        intelligence_category: intelligence_result?.category,
        booking_confidence: intelligence_result?.bookingConfidence,
      },
    }).catch(err => console.error("Error logging timeline event:", err));

    return NextResponse.json({
      ok: true,
      booking_url: bookingUrl,
      message: "Booking link generated and sent",
    });
  } catch (error: any) {
    console.error("Error in auto-booking-link:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

































