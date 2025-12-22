// Block 34044 — SmartSend Roofing "AI Crew Dispatch + Install Day Coordination Engine" v1
// Edge Function: /install-day-messages
// Sends morning messages at 7 AM on install day to crew leaders and homeowners

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Get SMS provider configuration
async function getSMSConfig(workspaceId: string) {
  // Try to get from workspace_settings
  const { data: settings } = await supabase
    .from("workspace_settings")
    .select("settings")
    .eq("workspace_id", workspaceId)
    .single();

  if (settings?.settings?.sms) {
    return settings.settings.sms;
  }

  // Fallback to environment variables
  return {
    provider: Deno.env.get("SMS_PROVIDER") || "twilio",
    phone_number: Deno.env.get("SMS_FROM_NUMBER"),
    credentials: {
      account_sid: Deno.env.get("TWILIO_ACCOUNT_SID"),
      auth_token: Deno.env.get("TWILIO_AUTH_TOKEN"),
    },
    api_url: Deno.env.get("VONAGE_SMS_URL"),
  };
}

// Send SMS via provider
async function sendSMS(
  to: string,
  message: string,
  config: any
): Promise<{ success: boolean; error?: string }> {
  try {
    const provider = config.provider?.toLowerCase() || "twilio";

    if (provider === "twilio") {
      const accountSid = config.credentials?.account_sid || config.credentials?.accountSid;
      const authToken = config.credentials?.auth_token || config.credentials?.authToken;
      const fromNumber = config.phone_number || config.phoneNumber;

      if (!accountSid || !authToken || !fromNumber) {
        return { success: false, error: "Missing Twilio credentials" };
      }

      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const formData = new URLSearchParams({
        To: to,
        From: fromNumber,
        Body: message,
      });

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.message || "Twilio API error" };
      }

      return { success: true };
    } else if (provider === "vonage" || provider === "nexmo") {
      const vonageUrl = config.api_url || Deno.env.get("VONAGE_SMS_URL");
      if (!vonageUrl) {
        return { success: false, error: "Vonage URL not configured" };
      }

      const response = await fetch(vonageUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, text: message }),
      });

      return { success: response.ok };
    }

    return { success: false, error: `Unsupported provider: ${provider}` };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Unknown error sending SMS",
    };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get today's date
    const now = new Date();
    const today = now.toISOString().slice(0, 10); // YYYY-MM-DD

    // Find all jobs scheduled for today with assigned crews
    const { data: scheduledJobs, error: jobsError } = await supabase
      .from("job_schedule")
      .select(`
        id,
        job_id,
        start_date,
        notes,
        jobs!inner (
          id,
          lead_id,
          team_id,
          stage,
          leads (
            id,
            first_name,
            last_name,
            email,
            phone,
            address
          )
        )
      `)
      .eq("start_date", today);

    if (jobsError) {
      console.error("Error fetching scheduled jobs:", jobsError);
      return new Response(
        JSON.stringify({ error: jobsError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!scheduledJobs || scheduledJobs.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No jobs scheduled for today",
          jobs_processed: 0 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    let errors: string[] = [];

    for (const schedule of scheduledJobs) {
      const job = schedule.jobs;
      if (!job || job.stage !== "scheduled") {
        continue; // Skip if job not in scheduled stage
      }

      const lead = job.leads;
      if (!lead) {
        errors.push(`Job ${job.id}: Lead not found`);
        continue;
      }

      // Get assigned crew for this job
      const { data: jobCrew } = await supabase
        .from("job_crews")
        .select(`
          crew_id,
          crews (
            id,
            name,
            leader_phone,
            foreman_phone
          )
        `)
        .eq("job_id", job.id)
        .eq("is_primary", true)
        .single();

      if (!jobCrew || !jobCrew.crews) {
        errors.push(`Job ${job.id}: No crew assigned`);
        continue;
      }

      const crew = jobCrew.crews as any;
      const crewLeaderPhone = crew.leader_phone || crew.foreman_phone;

      // Get workspace/team SMS config
      // For now, we'll use team_id to get workspace, but we might need to adjust
      const { data: team } = await supabase
        .from("teams")
        .select("workspace_id")
        .eq("id", job.team_id)
        .single();

      if (!team) {
        errors.push(`Job ${job.id}: Team/workspace not found`);
        continue;
      }

      const smsConfig = await getSMSConfig(team.workspace_id);
      if (!smsConfig.phone_number && !smsConfig.api_url) {
        errors.push(`Job ${job.id}: SMS not configured for workspace`);
        continue;
      }

      // Build messages
      const homeownerName = `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "there";
      const address = lead.address || "your property";
      const arrivalWindow = "8:00 AM - 10:00 AM"; // Default window, could be configurable

      const homeownerMessage = 
        `Good morning ${homeownerName}! Your roofing crew is scheduled for today.\n\n` +
        `Arrival window: ${arrivalWindow}\n` +
        `We'll keep you updated throughout the installation.`;

      const crewMessage = 
        `Today's install:\n` +
        `Address: ${address}\n` +
        `Homeowner: ${homeownerName}\n` +
        `Phone: ${lead.phone || "N/A"}\n` +
        `ETA window: ${arrivalWindow}\n` +
        (schedule.notes ? `Notes: ${schedule.notes}` : "");

      // Send SMS to homeowner
      if (lead.phone) {
        const homeownerResult = await sendSMS(lead.phone, homeownerMessage, smsConfig);
        if (!homeownerResult.success) {
          errors.push(`Job ${job.id}: Failed to send SMS to homeowner - ${homeownerResult.error}`);
        } else {
          // Log homeowner update
          await supabase.from("homeowner_updates").insert({
            job_id: job.id,
            update_type: "install_scheduled",
            message_sent: homeownerMessage,
            sent_via: "sms",
          });
        }
      }

      // Send SMS to crew leader
      if (crewLeaderPhone) {
        const crewResult = await sendSMS(crewLeaderPhone, crewMessage, smsConfig);
        if (!crewResult.success) {
          errors.push(`Job ${job.id}: Failed to send SMS to crew - ${crewResult.error}`);
        }
      }

      processed++;
    }

    return new Response(
      JSON.stringify({
        success: true,
        jobs_processed: processed,
        total_scheduled: scheduledJobs.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in install-day-messages:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

































