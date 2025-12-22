// Block 24620 — SmartSend Roofing Job Timeline v2 AI Insights
// GET /api/jobs/[jobId]/timeline/insights
// Generates AI-powered insights from timeline events

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const supabase = createClient();
    const { jobId } = params;

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Verify user has access to this job
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id, lead_id, status, job_value")
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Fetch recent timeline events
    const { data: events, error: eventsError } = await supabase
      .from("job_timelines")
      .select("*")
      .or(`job_id.eq.${jobId},lead_id.eq.${job.lead_id || "null"}`)
      .order("created_at", { ascending: false })
      .limit(50);

    if (eventsError) {
      console.error("Error fetching events for insights:", eventsError);
      return NextResponse.json(
        { error: "Failed to fetch events" },
        { status: 500 }
      );
    }

    // Generate insights based on event patterns
    const insights = generateInsights(events || [], job);

    return NextResponse.json({
      insights,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error generating insights:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Generate AI insights from timeline events
function generateInsights(events: any[], job: any): string[] {
  const insights: string[] = [];

  // Check for delivery confirmation
  const hasDeliveryConfirmation = events.some(
    (e) => e.event_type === "supplier_confirmed" || e.event_type === "supplier_delivery_scheduled"
  );
  if (!hasDeliveryConfirmation && job.status === "scheduled") {
    insights.push("🟡 Job running behind — no delivery confirmation yet.");
  }

  // Check payment flow
  const depositCollected = events.some((e) => e.event_type === "payment_deposit_collected");
  const finalCollected = events.some((e) => e.event_type === "payment_final_collected");
  const acvReceived = events.some((e) => e.event_type === "insurance_acv_received");
  if (depositCollected && (finalCollected || acvReceived)) {
    insights.push("🟢 Payment flow healthy — all checks received.");
  }

  // Check for crew issues
  const crewIssues = events.filter((e) => e.event_type === "crew_issue_reported");
  const materialShortages = events.filter((e) => e.event_type === "material_shortage_alert");
  if (crewIssues.length > 0 || materialShortages.length > 0) {
    insights.push("🔴 Crew reported issue — missing materials may delay install.");
  }

  // Check homeowner engagement
  const recentHomeownerMessages = events.filter(
    (e) =>
      e.event_type?.includes("homeowner_") &&
      new Date(e.created_at) > new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
  );
  if (recentHomeownerMessages.length === 0 && job.status !== "completed") {
    insights.push("🔵 Homeowner hasn't replied in 3 days — follow-up recommended.");
  }

  // Check for weather delays
  const weatherDelays = events.filter((e) => e.event_type === "scheduling_weather_delay");
  if (weatherDelays.length > 0) {
    insights.push("🌧️ Weather delays detected — consider rescheduling.");
  }

  // Check for overdue payments
  const overdueAlerts = events.filter((e) => e.event_type === "payment_overdue_alert");
  if (overdueAlerts.length > 0) {
    insights.push("💰 Payment overdue — follow up with homeowner.");
  }

  // Check supplement status
  const supplementSubmitted = events.some((e) => e.event_type === "insurance_supplement_submitted");
  const supplementApproved = events.some((e) => e.event_type === "insurance_supplement_approved");
  if (supplementSubmitted && !supplementApproved) {
    insights.push("📋 Supplement submitted — awaiting adjuster approval.");
  }

  return insights.length > 0 ? insights : ["✅ Job timeline looks healthy — no issues detected."];
}






































