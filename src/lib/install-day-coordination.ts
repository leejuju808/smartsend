// Block 34044 — Install Day Coordination Helper Functions
// Utilities for sending homeowner updates and managing install day coordination

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export interface HomeownerUpdateMessage {
  update_type: 
    | 'install_scheduled'
    | 'crew_arrived'
    | 'tear_off_started'
    | 'underlayment_installing'
    | 'shingling_underway'
    | 'cleanup_in_progress'
    | 'installation_complete'
    | 'delay_notification';
  message: string;
}

const updateMessages: Record<string, string> = {
  install_scheduled: "Your roofing crew is scheduled for today. We'll keep you updated throughout the installation.",
  crew_arrived: "Your roofing crew has arrived and is beginning work.",
  tear_off_started: "Roof tear-off has begun.",
  underlayment_installing: "Installing underlayment.",
  shingling_underway: "Shingling now underway.",
  cleanup_in_progress: "Cleanup in progress.",
  installation_complete: "Your roof installation is complete!",
  delay_notification: "Your roofing crew is running slightly behind schedule today. We'll keep you updated on their arrival time. Thank you for your patience!",
};

/**
 * Send homeowner update via SMS
 */
export async function sendHomeownerUpdate(
  jobId: string,
  updateType: HomeownerUpdateMessage['update_type'],
  customMessage?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get job and lead info
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, lead_id, team_id")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return { success: false, error: "Job not found" };
    }

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, phone, first_name, last_name")
      .eq("id", job.lead_id)
      .single();

    if (leadError || !lead || !lead.phone) {
      return { success: false, error: "Lead phone not found" };
    }

    const message = customMessage || updateMessages[updateType] || "";
    if (!message) {
      return { success: false, error: "No message provided" };
    }

    // Get SMS config
    const vonageUrl = process.env.VONAGE_SMS_URL;
    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

    let smsSent = false;

    // Send via Vonage
    if (vonageUrl) {
      const response = await fetch(vonageUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: lead.phone, text: message }),
      });
      smsSent = response.ok;
    }
    // Send via Twilio
    else if (twilioAccountSid && twilioAuthToken && twilioPhoneNumber) {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
      const formData = new URLSearchParams({
        To: lead.phone,
        From: twilioPhoneNumber,
        Body: message,
      });
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
        },
        body: formData.toString(),
      });
      smsSent = response.ok;
    } else {
      return { success: false, error: "SMS provider not configured" };
    }

    if (smsSent) {
      // Log homeowner update
      await supabase.from("homeowner_updates").insert({
        job_id: jobId,
        update_type: updateType,
        message_sent: message,
        sent_via: "sms",
      });
      return { success: true };
    }

    return { success: false, error: "Failed to send SMS" };
  } catch (error: any) {
    return { success: false, error: error.message || "Unknown error" };
  }
}

/**
 * Get install day status for a job
 */
export async function getInstallDayStatus(jobId: string) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const { data, error } = await supabase.rpc("get_install_day_status", {
    p_job_id: jobId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Get available crews for a job
 */
export async function getAvailableCrews(
  workspaceId: string,
  jobDate: string,
  requiredSkills: string[] = []
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const { data, error } = await supabase.rpc("get_available_crews", {
    p_workspace_id: workspaceId,
    p_job_date: jobDate,
    p_required_skills: requiredSkills,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

































