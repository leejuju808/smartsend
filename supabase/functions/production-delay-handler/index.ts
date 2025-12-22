// Block 38390 — SmartSend Roofing Production Delay Handler v1
// Edge Function: Auto-detect delays and reschedule jobs with homeowner notifications

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

interface DelayRequest {
  job_id: string;
  reason: 'weather' | 'material_delay' | 'crew_late' | 'emergency' | 'overrun';
  delay_days?: number;
  notes?: string;
}

Deno.serve(async (req: Request) => {
  try {
    const { job_id, reason, delay_days = 1, notes }: DelayRequest = await req.json();

    if (!job_id || !reason) {
      return new Response(
        JSON.stringify({ error: "job_id and reason are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Find the production calendar entry for this job
    const { data: schedule, error: scheduleError } = await supabase
      .from("production_calendar")
      .select("*")
      .eq("job_id", job_id)
      .eq("status", "scheduled")
      .order("start_date", { ascending: true })
      .limit(1)
      .single();

    if (scheduleError || !schedule) {
      return new Response(
        JSON.stringify({ error: "Schedule not found for this job" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Calculate new end date
    const currentEndDate = new Date(schedule.end_date);
    const newEndDate = new Date(currentEndDate);
    newEndDate.setDate(newEndDate.getDate() + delay_days);

    // 3. Update production calendar
    const { data: updatedSchedule, error: updateError } = await supabase
      .from("production_calendar")
      .update({
        status: "delayed",
        end_date: newEndDate.toISOString().slice(0, 10),
        delay_reason: reason,
        delay_days: (schedule.delay_days || 0) + delay_days,
        estimated_duration_days: schedule.estimated_duration_days + delay_days,
        notes: notes || schedule.notes,
        updated_at: new Date().toISOString()
      })
      .eq("id", schedule.id)
      .select()
      .single();

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Failed to update schedule", details: updateError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. Get job and lead information for notification
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, title, lead_id, workspace_id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // 5. Get lead information for SMS notification
    let homeownerPhone: string | null = null;
    let homeownerName: string | null = null;

    if (job.lead_id) {
      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .select("phone, first_name, last_name")
        .eq("id", job.lead_id)
        .single();

      if (!leadError && lead) {
        homeownerPhone = lead.phone || null;
        homeownerName = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Homeowner";
      }
    }

    // 6. Send SMS notification to homeowner if phone available
    if (homeownerPhone) {
      const delayMessages: Record<string, string> = {
        weather: "We're experiencing weather delays that will push back your roof installation.",
        material_delay: "We're experiencing a material delivery delay that will push back your roof installation.",
        crew_late: "Due to crew scheduling, your roof installation will be delayed.",
        emergency: "An emergency repair has come up that requires our crew's immediate attention. Your installation will be rescheduled.",
        overrun: "The previous job is taking longer than expected. Your installation will be rescheduled."
      };

      const message = `Hi ${homeownerName}, ${delayMessages[reason] || "Your roof installation is experiencing a brief delay."} We will update you shortly with the new schedule. Thank you for your patience.`;

      // Get workspace SMS configuration
      const { data: workspace } = await supabase
        .from("workspaces")
        .select("id, sms_provider, sms_credentials")
        .eq("id", job.workspace_id)
        .single();

      if (workspace?.sms_provider && workspace?.sms_credentials) {
        try {
          // Use Vonage/Twilio based on workspace config
          const smsConfig = workspace.sms_credentials;
          const provider = workspace.sms_provider as "twilio" | "vonage";

          if (provider === "twilio" && smsConfig.account_sid && smsConfig.auth_token && smsConfig.phone_number) {
            const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${smsConfig.account_sid}/Messages.json`;
            const formData = new URLSearchParams();
            formData.append("To", homeownerPhone);
            formData.append("From", smsConfig.phone_number);
            formData.append("Body", message);

            await fetch(twilioUrl, {
              method: "POST",
              headers: {
                "Authorization": `Basic ${btoa(`${smsConfig.account_sid}:${smsConfig.auth_token}`)}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: formData.toString(),
            });
          } else if (provider === "vonage" && smsConfig.api_key && smsConfig.api_secret) {
            // Vonage/Nexmo SMS
            const vonageUrl = "https://rest.nexmo.com/sms/json";
            const params = new URLSearchParams({
              api_key: smsConfig.api_key,
              api_secret: smsConfig.api_secret,
              to: homeownerPhone,
              from: smsConfig.phone_number || smsConfig.from || "SmartSend",
              text: message,
            });

            await fetch(`${vonageUrl}?${params.toString()}`, {
              method: "POST",
            });
          }
        } catch (smsError) {
          console.error("Failed to send SMS notification:", smsError);
          // Continue even if SMS fails
        }
      }
    }

    // 7. Update roofing_jobs scheduled dates
    await supabase
      .from("roofing_jobs")
      .update({
        scheduled_end_date: newEndDate.toISOString().slice(0, 10),
        updated_at: new Date().toISOString()
      })
      .eq("id", job_id);

    // 8. Create conflict record if needed
    await supabase
      .from("schedule_conflicts")
      .insert({
        workspace_id: job.workspace_id,
        job_id: job_id,
        crew_id: schedule.crew_id,
        conflict_type: reason === "material_delay" ? "material_delay" : "over_capacity",
        severity: "high",
        details: {
          delay_reason: reason,
          delay_days: delay_days,
          original_end_date: schedule.end_date,
          new_end_date: newEndDate.toISOString().slice(0, 10),
          notes: notes
        }
      });

    return new Response(
      JSON.stringify({
        success: true,
        schedule: {
          id: updatedSchedule.id,
          job_id: updatedSchedule.job_id,
          crew_id: updatedSchedule.crew_id,
          start_date: updatedSchedule.start_date,
          end_date: updatedSchedule.end_date,
          status: updatedSchedule.status,
          delay_reason: updatedSchedule.delay_reason,
          delay_days: updatedSchedule.delay_days
        },
        notification_sent: !!homeownerPhone
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error: any) {
    console.error("Production delay handler error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error.message
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
































