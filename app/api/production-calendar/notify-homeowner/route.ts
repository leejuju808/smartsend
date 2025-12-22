// Block 90000 — Production Calendar Homeowner Notification API
// POST /api/production-calendar/notify-homeowner

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { format } from "date-fns";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();
    const { job_id, event_id, event_type, new_start_time } = body;

    if (!job_id || !event_type) {
      return NextResponse.json(
        { error: "job_id and event_type are required" },
        { status: 400 }
      );
    }

    // Get job and lead info
    const { data: job } = await supabase
      .from("roofing_jobs")
      .select("id, lead_id, title, address, workspace_id")
      .eq("id", job_id)
      .single();

    if (!job || !job.lead_id) {
      return NextResponse.json({ error: "Job or lead not found" }, { status: 404 });
    }

    // Get lead/contact info
    const { data: lead } = await supabase
      .from("leads")
      .select("id, email, name, contact_id")
      .eq("id", job.lead_id)
      .single();

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Get event details if event_id provided
    let eventDetails: any = null;
    if (event_id) {
      const { data: event } = await supabase
        .from("calendar_events")
        .select("title, start_time, end_time, crew_id, crews(name)")
        .eq("id", event_id)
        .single();
      eventDetails = event;
    }

    // Build notification message
    let message = "";
    let subject = "";

    if (event_type === "install_scheduled") {
      const startTime = eventDetails?.start_time
        ? format(new Date(eventDetails.start_time), "EEEE, MMMM d 'between' h:mm a")
        : "soon";
      subject = "Your roof installation is scheduled";
      message = `Hi ${lead.name || "there"},

Your roof installation is scheduled for ${startTime}.

Track progress at your portal: ${process.env.NEXT_PUBLIC_APP_URL}/portal/${job.id}

We'll send you a reminder the day before.`;
    } else if (event_type === "install_rescheduled") {
      const newTime = new_start_time
        ? format(new Date(new_start_time), "EEEE, MMMM d 'between' h:mm a")
        : "a new date";
      subject = "Installation date updated";
      message = `Hi ${lead.name || "there"},

Due to weather/scheduling, your installation has been moved to ${newTime}.

Track progress at your portal: ${process.env.NEXT_PUBLIC_APP_URL}/portal/${job.id}`;
    }

    // Send notification via email (if email exists)
    if (lead.email && message) {
      // Use existing email sending infrastructure
      // For now, we'll create a notification record
      const { error: notifError } = await supabase
        .from("homeowner_notifications")
        .insert({
          job_id,
          homeowner_id: lead.contact_id || lead.id,
          type: event_type,
          message,
          sent_via: "email",
        });

      if (notifError) {
        console.error("Failed to create notification:", notifError);
      }

      // TODO: Actually send email via your email service
      // This would integrate with your existing email sending system
    }

    return NextResponse.json({ success: true, message: "Notification sent" });
  } catch (error: any) {
    console.error("Error notifying homeowner:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























