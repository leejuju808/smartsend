// Block 33602 — Book Appointment Edge Function
// Books an appointment when homeowner selects a time slot

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  try {
    const { 
      contractor_id, 
      lead_id, 
      start_time, 
      end_time, 
      appointment_type,
      location,
      token // Optional: booking link token
    } = await req.json();

    if (!contractor_id || !lead_id || !start_time || !end_time) {
      return new Response(
        JSON.stringify({ 
          error: "contractor_id, lead_id, start_time, and end_time are required" 
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate token if provided
    if (token) {
      const { data: bookingLink } = await supabase
        .from("booking_links")
        .select("*")
        .eq("token", token)
        .eq("lead_id", lead_id)
        .eq("contractor_id", contractor_id)
        .is("used_at", null)
        .single();

      if (!bookingLink) {
        return new Response(
          JSON.stringify({ error: "Invalid or expired booking link" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }

      // Check if expired
      if (bookingLink.expires_at && new Date(bookingLink.expires_at) < new Date()) {
        return new Response(
          JSON.stringify({ error: "Booking link has expired" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Check for conflicts
    const { data: conflicts } = await supabase
      .from("appointments")
      .select("id")
      .eq("contractor_id", contractor_id)
      .in("status", ["scheduled", "rescheduled"])
      .lt("start_time", end_time)
      .gt("end_time", start_time)
      .limit(1);

    if (conflicts && conflicts.length > 0) {
      return new Response(
        JSON.stringify({ error: "Time slot is already booked" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get appointment type details if provided
    let duration_minutes = 45; // Default
    if (appointment_type) {
      const { data: typeData } = await supabase
        .from("appointment_types")
        .select("duration_minutes")
        .eq("contractor_id", contractor_id)
        .eq("name", appointment_type)
        .eq("is_active", true)
        .single();

      if (typeData) {
        duration_minutes = typeData.duration_minutes;
      }
    }

    // Get lead info for location if not provided
    let appointmentLocation = location;
    if (!appointmentLocation) {
      const { data: lead } = await supabase
        .from("leads")
        .select("address, custom")
        .eq("id", lead_id)
        .single();

      if (lead) {
        appointmentLocation = lead.address || lead.custom?.address || null;
      }
    }

    // Create appointment
    const { data: appointment, error: appointmentError } = await supabase
      .from("appointments")
      .insert({
        contractor_id,
        lead_id,
        appointment_type: appointment_type || "Roof Estimate",
        start_time,
        end_time,
        location: appointmentLocation,
        status: "scheduled",
        source: token ? "booking_link" : "manual",
      })
      .select()
      .single();

    if (appointmentError || !appointment) {
      console.error("Error creating appointment:", appointmentError);
      return new Response(
        JSON.stringify({ error: "Failed to create appointment" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Mark booking link as used if token was provided
    if (token) {
      await supabase
        .from("booking_links")
        .update({ 
          used_at: new Date().toISOString(),
          appointment_id: appointment.id
        })
        .eq("token", token);
    }

    // Update lead status to hot
    await supabase
      .from("leads")
      .update({ 
        status: "hot",
        last_activity_at: new Date().toISOString()
      })
      .eq("id", lead_id);

    // TODO: Sync to Google Calendar if contractor has calendar connection
    // This will be handled by a separate sync function

    return new Response(
      JSON.stringify({ 
        ok: true, 
        appointment: appointment
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in book-appointment:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

































