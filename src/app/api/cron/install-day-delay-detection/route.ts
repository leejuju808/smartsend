// Block 34044 — Delay Detection & Auto-Handling
// Checks for crews that haven't checked in by expected time and sends notifications

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
    const now = new Date();
    const currentHour = now.getHours();

    // Expected arrival window: 8-10 AM (check if it's past 10 AM)
    if (currentHour < 10) {
      return NextResponse.json({
        success: true,
        message: "Too early - checking after 10 AM",
        checked: 0,
      });
    }

    // Find jobs scheduled for today with assigned crews
    const { data: scheduledJobs, error: jobsError } = await supabase
      .from("job_schedule")
      .select(`
        id,
        job_id,
        start_date,
        jobs!inner (
          id,
          lead_id,
          team_id,
          stage,
          leads (
            id,
            first_name,
            last_name,
            phone,
            email
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
        checked: 0,
      });
    }

    let checked = 0;
    let delaysDetected = 0;
    const errors: string[] = [];

    for (const schedule of scheduledJobs) {
      const job = schedule.jobs as any;
      if (!job || job.stage !== "scheduled") {
        continue;
      }

      // Get assigned crew
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
        continue; // No crew assigned
      }

      // Check if crew has checked in as "arrived" today
      const { data: checkins } = await supabase
        .from("crew_checkins")
        .select("id, status, checked_in_at")
        .eq("job_id", job.id)
        .eq("crew_id", (jobCrew.crews as any).id)
        .eq("status", "arrived")
        .gte("checked_in_at", `${today}T00:00:00`)
        .limit(1);

      checked++;

      // If no "arrived" check-in and it's past 10 AM, this is a delay
      if (!checkins || checkins.length === 0) {
        delaysDetected++;
        const crew = jobCrew.crews as any;
        const lead = job.leads as any;

        // Get team/workspace for SMS config
        const { data: team } = await supabase
          .from("teams")
          .select("workspace_id")
          .eq("id", job.team_id)
          .single();

        if (!team) {
          errors.push(`Job ${job.id}: Team not found`);
          continue;
        }

        // Get SMS config (simplified - would use same logic as install-day-messages)
        const vonageUrl = process.env.VONAGE_SMS_URL;
        const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
        const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
        const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

        // Message to crew leader
        const crewMessage = 
          `Delay Alert: You haven't checked in for today's install.\n` +
          `Job: ${lead?.first_name || "Customer"}\n` +
          `Please check in or contact dispatch if there's an issue.`;

        const crewPhone = crew.leader_phone || crew.foreman_phone;
        if (crewPhone) {
          // Send SMS to crew (simplified - would use proper SMS function)
          if (vonageUrl) {
            await fetch(vonageUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ to: crewPhone, text: crewMessage }),
            });
          } else if (twilioAccountSid && twilioAuthToken && twilioPhoneNumber) {
            const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
            const formData = new URLSearchParams({
              To: crewPhone,
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

        // Message to homeowner (polite update)
        if (lead?.phone) {
          const homeownerMessage = 
            `Update: Your roofing crew is running slightly behind schedule today. ` +
            `We'll keep you updated on their arrival time. Thank you for your patience!`;

          // Send SMS to homeowner
          if (vonageUrl) {
            await fetch(vonageUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ to: lead.phone, text: homeownerMessage }),
            });
          } else if (twilioAccountSid && twilioAuthToken && twilioPhoneNumber) {
            const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
            const formData = new URLSearchParams({
              To: lead.phone,
              From: twilioPhoneNumber,
              Body: homeownerMessage,
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

          // Log homeowner update
          await supabase.from("homeowner_updates").insert({
            job_id: job.id,
            update_type: "delay_notification",
            message_sent: homeownerMessage,
            sent_via: "sms",
          });
        }

        // Log delay for contractor (could create a notification or task)
        // For now, we'll just log it
        console.log(`Delay detected for job ${job.id}, crew ${crew.name}`);
      }
    }

    return NextResponse.json({
      success: true,
      checked,
      delays_detected: delaysDetected,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

































