// Block 33602 — Public Booking Link API
// Gets booking link details and validates token

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;
    const supabase = await createClient();

    // Get booking link details
    const { data: bookingLink, error: linkError } = await supabase
      .from("booking_links")
      .select(`
        *,
        leads:lead_id (
          id,
          email,
          phone,
          first_name,
          last_name,
          address
        ),
        profiles:contractor_id (
          id,
          email,
          full_name
        )
      `)
      .eq("token", token)
      .single();

    if (linkError || !bookingLink) {
      return NextResponse.json(
        { error: "Invalid booking link" },
        { status: 404 }
      );
    }

    // Check if expired
    if (bookingLink.expires_at && new Date(bookingLink.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Booking link has expired" },
        { status: 410 }
      );
    }

    // Check if already used
    if (bookingLink.used_at) {
      return NextResponse.json(
        { error: "This booking link has already been used" },
        { status: 410 }
      );
    }

    // Get contractor's schedule settings
    const { data: scheduleSettings } = await supabase
      .from("schedule_settings")
      .select("*")
      .eq("contractor_id", bookingLink.contractor_id)
      .single();

    // Get appointment types
    const { data: appointmentTypes } = await supabase
      .from("appointment_types")
      .select("*")
      .eq("contractor_id", bookingLink.contractor_id)
      .eq("is_active", true)
      .order("display_order");

    const lead = Array.isArray(bookingLink.leads) 
      ? bookingLink.leads[0] 
      : bookingLink.leads;
    const contractor = Array.isArray(bookingLink.profiles)
      ? bookingLink.profiles[0]
      : bookingLink.profiles;

    return NextResponse.json({
      token,
      contractor: contractor ? {
        id: contractor.id,
        name: contractor.full_name || contractor.email,
      } : null,
      lead: lead ? {
        id: lead.id,
        name: lead.first_name && lead.last_name 
          ? `${lead.first_name} ${lead.last_name}`
          : lead.first_name || lead.email,
        email: lead.email,
        phone: lead.phone,
        address: lead.address,
      } : null,
      schedule_settings: scheduleSettings,
      appointment_types: appointmentTypes || [],
      expires_at: bookingLink.expires_at,
    });
  } catch (error: any) {
    console.error("Error in booking link GET:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

































