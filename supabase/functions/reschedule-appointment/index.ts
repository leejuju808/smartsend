// Block 33602 — Reschedule Appointment Edge Function
// Handles appointment rescheduling from homeowner or contractor

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
      appointment_id, 
      new_start_time, 
      new_end_time,
      reason,
      initiated_by
    } = await req.json();

    if (!appointment_id || !new_start_time || !new_end_time) {
      return new Response(
        JSON.stringify({ 
          error: "appointment_id, new_start_time, and new_end_time are required" 
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get existing appointment
    const { data: appointment, error: apptError } = await supabase
      .from("appointments")
      .select("*")
      .eq("id", appointment_id)
      .single();

    if (apptError || !appointment) {
      return new Response(
        JSON.stringify({ error: "Appointment not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check for conflicts with new time
    const { data: conflicts } = await supabase
      .from("appointments")
      .select("id")
      .eq("contractor_id", appointment.contractor_id)
      .neq("id", appointment_id)
      .in("status", ["scheduled", "rescheduled"])
      .lt("start_time", new_end_time)
      .gt("end_time", new_start_time)
      .limit(1);

    if (conflicts && conflicts.length > 0) {
      return new Response(
        JSON.stringify({ error: "New time slot is already booked" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    // Log reschedule
    const { error: rescheduleError } = await supabase
      .from("appointment_reschedules")
      .insert({
        appointment_id,
        lead_id: appointment.lead_id,
        contractor_id: appointment.contractor_id,
        old_time: appointment.start_time,
        new_time: new_start_time,
        reason: reason || null,
        initiated_by: initiated_by || "homeowner",
      });

    if (rescheduleError) {
      console.error("Error logging reschedule:", rescheduleError);
    }

    // Update appointment
    const { data: updatedAppointment, error: updateError } = await supabase
      .from("appointments")
      .update({
        start_time: new_start_time,
        end_time: new_end_time,
        status: "rescheduled",
        reminder_24h_sent: false,
        reminder_2h_sent: false,
        reminder_on_way_sent: false,
      })
      .eq("id", appointment_id)
      .select()
      .single();

    if (updateError || !updatedAppointment) {
      console.error("Error updating appointment:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to reschedule appointment" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // TODO: Update Google Calendar event if synced
    // This will be handled by calendar sync function

    return new Response(
      JSON.stringify({ 
        ok: true, 
        appointment: updatedAppointment
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in reschedule-appointment:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

































