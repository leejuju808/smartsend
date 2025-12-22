/**
 * Block 25300 — SmartSend Roofing Weather Intelligence v1
 * POST /api/weather/homeowner-notify
 * Sends weather notification to homeowner
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const notifySchema = z.object({
  job_id: z.string().uuid(),
  message: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();

    // Verify user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { job_id, message } = notifySchema.parse(body);

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("workspace_id, lead_id, scheduled_start_date, current_weather_risk_score, weather_risk_category")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Verify user has access
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", job.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get lead/contact info
    const { data: lead } = await supabase
      .from("leads")
      .select("email, name, contact_id")
      .eq("id", job.lead_id)
      .single();

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Build homeowner message
    const homeownerMessage =
      message ||
      buildHomeownerMessage(
        job.scheduled_start_date,
        job.current_weather_risk_score,
        job.weather_risk_category
      );

    // Send message via inbox if contact_id exists
    if (lead.contact_id) {
      const { data: thread } = await supabase
        .from("inbox_threads")
        .select("id")
        .eq("contact_id", lead.contact_id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();

      if (thread) {
        // Send message via inbox API
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/inbox-send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            thread_id: thread.id,
            message: homeownerMessage,
            workspace_id: job.workspace_id,
          }),
        });
      }
    }

    // Log weather event
    await supabase.from("weather_events").insert({
      workspace_id: job.workspace_id,
      job_id: job_id,
      event_type: "homeowner_notified",
      event_title: "Homeowner Weather Notification Sent",
      event_message: homeownerMessage,
      event_severity: "info",
      event_date: new Date().toISOString().split("T")[0],
      homeowner_notified: true,
      metadata: {
        risk_score: job.current_weather_risk_score,
        risk_category: job.weather_risk_category,
      },
    });

    return NextResponse.json({
      ok: true,
      message: "Homeowner notified successfully",
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Error notifying homeowner:", error);
    return NextResponse.json(
      { error: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}

function buildHomeownerMessage(
  installDate: string | null,
  riskScore: number | null,
  riskCategory: string | null
): string {
  let message = "Hi! 👋\n\n";

  if (installDate) {
    message += `We're monitoring the weather for your installation scheduled for ${new Date(installDate).toLocaleDateString()}.\n\n`;
  }

  if (riskScore && riskScore >= 60) {
    message +=
      "🌧️ Looks like there may be some weather concerns on your installation day. ";
    message +=
      "We're keeping a close eye on the forecast and will update you with the best plan.\n\n";
    message +=
      "If conditions aren't ideal, we'll reach out to discuss rescheduling options that work for you.\n\n";
  } else {
    message +=
      "We're monitoring the weather forecast and will keep you updated if anything changes.\n\n";
  }

  message += "Thanks for your patience! 🙏";

  return message;
}




































