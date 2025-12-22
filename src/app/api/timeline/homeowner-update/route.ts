// Block 64000 — Production Timeline Optimizer
// POST /api/timeline/homeowner-update
// Automatically sends timeline updates to homeowners

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { job_id, send_email = true, custom_message } = body;

    if (!job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Get job with lead/contact info
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select(`
        *,
        leads(id, email, first_name, last_name),
        contacts(id, email, first_name, last_name)
      `)
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Verify access
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Get timeline
    const { data: timeline, error: timelineError } = await supabase
      .from("production_timeline")
      .select("*")
      .eq("job_id", job_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (timelineError || !timeline) {
      return NextResponse.json(
        { error: "No timeline found for this job" },
        { status: 404 }
      );
    }

    // Get homeowner contact info
    const homeownerEmail = job.leads?.email || job.contacts?.email;
    const homeownerName = job.leads?.first_name || job.contacts?.first_name || "Homeowner";

    if (!homeownerEmail) {
      return NextResponse.json(
        { error: "No homeowner email found" },
        { status: 400 }
      );
    }

    // Format completion time
    const completionTime = timeline.weather_adjusted_end || timeline.predicted_end;
    const completionDate = completionTime ? new Date(completionTime) : null;
    
    let message = custom_message;
    if (!message) {
      if (completionDate) {
        const dateStr = completionDate.toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric"
        });
        const timeStr = completionDate.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true
        });

        if (timeline.delay_hours > 0) {
          message = `Hi ${homeownerName},\n\nWe wanted to update you on your roof project. Due to ${timeline.delay_reason || "unexpected circumstances"}, we're now expecting to complete your roof by ${dateStr} at ${timeStr}.\n\nWe apologize for any inconvenience and appreciate your patience.\n\nThank you!`;
        } else {
          message = `Hi ${homeownerName},\n\nGreat news! Your roof is on track and expected to be completed by ${dateStr} at ${timeStr}.\n\nWe'll keep you updated if anything changes.\n\nThank you!`;
        }
      } else {
        message = `Hi ${homeownerName},\n\nWe wanted to update you on your roof project. We're making good progress and will keep you informed of the completion timeline.\n\nThank you!`;
      }
    }

    // Send email if requested
    if (send_email) {
      // TODO: Integrate with email sending service
      // For now, we'll just log it
      console.log("Would send email to:", homeownerEmail);
      console.log("Message:", message);

      // You can integrate with your email service here
      // Example: await sendEmail(homeownerEmail, "Roof Project Update", message);
    }

    // Create notification/activity log
    await supabase
      .from("job_events")
      .insert({
        job_id,
        workspace_id: job.workspace_id,
        event_type: "homeowner_timeline_update",
        metadata: {
          email: homeownerEmail,
          completion_time: completionTime,
          delay_hours: timeline.delay_hours,
          message_sent: send_email
        }
      })
      .catch(err => console.error("Error logging event:", err));

    return NextResponse.json({
      success: true,
      message_sent: send_email,
      homeowner_email: homeownerEmail,
      completion_time: completionTime,
      message: message
    });
  } catch (error: any) {
    console.error("Error in /api/timeline/homeowner-update:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

// GET /api/timeline/homeowner-update?job_id=xxx
// Get homeowner update history for a job
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const job_id = searchParams.get("job_id");

    if (!job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Get update history from job_events
    const { data: updates, error } = await supabase
      .from("job_events")
      .select("*")
      .eq("job_id", job_id)
      .eq("event_type", "homeowner_timeline_update")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching updates:", error);
      return NextResponse.json(
        { error: "Failed to fetch updates", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      updates: updates || []
    });
  } catch (error: any) {
    console.error("Error in GET /api/timeline/homeowner-update:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}




























