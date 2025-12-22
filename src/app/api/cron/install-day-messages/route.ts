// Block 34044 — Install Day Morning Messages
// Sends messages at 7 AM on install day to crew leaders and homeowners
// Can be called as cron job or edge function

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  try {
    // Verify CRON secret if provided
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Missing Supabase configuration" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get today's date
    const today = new Date().toISOString().slice(0, 10);

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
      return NextResponse.json(
        { error: jobsError.message },
        { status: 500 }
      );
    }

    if (!scheduledJobs || scheduledJobs.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No jobs scheduled for today",
        jobs_processed: 0,
      });
    }

    let processed = 0;
    const errors: string[] = [];

    // Get SMS config from env
    const vonageUrl = process.env.VONAGE_SMS_URL;
    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

    for (const schedule of scheduledJobs) {
      const job = schedule.jobs as any;
      if (!job || job.stage !== "scheduled") {
        continue;
      }

      const lead = job.leads as any;
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

      // Build messages
      const homeownerName = `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "there";
      const address = lead.address || "your property";
      const arrivalWindow = "8:00 AM - 10:00 AM";

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
        let smsSent = false;
        if (vonageUrl) {
          const response = await fetch(vonageUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to: lead.phone, text: homeownerMessage }),
          });
          smsSent = response.ok;
        } else if (twilioAccountSid && twilioAuthToken && twilioPhoneNumber) {
          const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
          const formData = new URLSearchParams({
            To: lead.phone,
            From: twilioPhoneNumber,
            Body: homeownerMessage,
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
        }

        if (smsSent) {
          // Log homeowner update
          await supabase.from("homeowner_updates").insert({
            job_id: job.id,
            update_type: "install_scheduled",
            message_sent: homeownerMessage,
            sent_via: "sms",
          });
        } else {
          errors.push(`Job ${job.id}: Failed to send SMS to homeowner`);
        }
      }

      // Send SMS to crew leader
      if (crewLeaderPhone) {
        if (vonageUrl) {
          await fetch(vonageUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to: crewLeaderPhone, text: crewMessage }),
          });
        } else if (twilioAccountSid && twilioAuthToken && twilioPhoneNumber) {
          const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
          const formData = new URLSearchParams({
            To: crewLeaderPhone,
            From: twilioPhoneNumber,
            Body: crewMessage,
          });
          await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: `Basic ${btoa(`${twilioAccountSid}:${twilioAuthToken}`)}`,
            },
            body: formData.toString(),
          });
        }
      }

      processed++;
    }

    return NextResponse.json({
      success: true,
      jobs_processed: processed,
      total_scheduled: scheduledJobs.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

































