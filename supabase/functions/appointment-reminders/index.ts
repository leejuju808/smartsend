// Block 33602 — Appointment Reminders Edge Function
// Runs hourly via cron to send automated reminders

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  try {
    const now = new Date();
    const processed: string[] = [];

    // Get all upcoming scheduled appointments
    const { data: appointments, error: appointmentsError } = await supabase
      .from("appointments")
      .select(`
        id,
        lead_id,
        start_time,
        status,
        reminder_24h_sent,
        reminder_2h_sent,
        reminder_on_way_sent,
        appointment_type,
        contractor_id,
        leads:lead_id (
          id,
          email,
          phone,
          first_name,
          last_name
        )
      `)
      .eq("status", "scheduled")
      .gte("start_time", now.toISOString())
      .lte("start_time", new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString()); // Next 48 hours

    if (appointmentsError) {
      console.error("Error fetching appointments:", appointmentsError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch appointments" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!appointments || appointments.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: "No appointments to process" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    for (const apt of appointments) {
      if (!apt.start_time || !apt.leads) continue;

      const startTime = new Date(apt.start_time);
      const diffMs = startTime.getTime() - now.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      const lead = Array.isArray(apt.leads) ? apt.leads[0] : apt.leads;
      if (!lead) continue;

      let message: string | null = null;
      let reminderType: string | null = null;

      // 24-hour reminder (send between 23-25 hours before)
      if (diffHours >= 23 && diffHours <= 25 && !apt.reminder_24h_sent) {
        const appointmentType = apt.appointment_type || "roofing estimate";
        const timeStr = startTime.toLocaleTimeString("en-US", { 
          hour: "numeric", 
          minute: "2-digit",
          hour12: true 
        });
        message = `Hi ${lead.first_name || "there"}, this is a reminder that your ${appointmentType} is scheduled for tomorrow at ${timeStr}. We look forward to seeing you!`;
        reminderType = "24h";
      }
      // 2-hour reminder (send between 1.9-2.1 hours before)
      else if (diffHours >= 1.9 && diffHours <= 2.1 && !apt.reminder_2h_sent) {
        const appointmentType = apt.appointment_type || "roofing estimate";
        const timeStr = startTime.toLocaleTimeString("en-US", { 
          hour: "numeric", 
          minute: "2-digit",
          hour12: true 
        });
        message = `Hi ${lead.first_name || "there"}, just a quick reminder that your ${appointmentType} is coming up in about 2 hours at ${timeStr}. See you soon!`;
        reminderType = "2h";
      }

      if (message && reminderType) {
        // Send SMS if phone available
        if (lead.phone) {
          try {
            // TODO: Integrate with your SMS provider (Twilio, Vonage, etc.)
            // For now, log the message
            console.log(`SMS to ${lead.phone}: ${message}`);
            
            // Example SMS send (replace with your SMS service)
            const smsProviderUrl = Deno.env.get("SMS_PROVIDER_URL");
            if (smsProviderUrl) {
              await fetch(smsProviderUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  to: lead.phone,
                  text: message,
                  appointment_id: apt.id,
                }),
              });
            }
          } catch (smsError) {
            console.error(`Error sending SMS to ${lead.phone}:`, smsError);
          }
        }

        // Send email as backup
        if (lead.email) {
          try {
            // TODO: Integrate with your email service
            console.log(`Email to ${lead.email}: ${message}`);
          } catch (emailError) {
            console.error(`Error sending email to ${lead.email}:`, emailError);
          }
        }

        // Update reminder flags
        const updateField = reminderType === "24h" ? "reminder_24h_sent" : "reminder_2h_sent";
        await supabase
          .from("appointments")
          .update({ [updateField]: true })
          .eq("id", apt.id);

        processed.push(apt.id);
      }
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        processed: processed.length,
        appointment_ids: processed
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in appointment-reminders:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

































