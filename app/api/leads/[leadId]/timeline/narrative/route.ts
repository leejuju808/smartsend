import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/utils/supabase/server";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const supabase = createClient();
  const { leadId } = await params;

  // Get current user for auth
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch all timeline events for this lead
  const { data: events, error } = await supabase
    .from("job_timelines")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!events || events.length === 0) {
    return NextResponse.json({
      summary: "No timeline events recorded for this job yet.",
    });
  }

  // Build a chronological summary of events
  const eventSummaries = events.map((event) => {
    const date = new Date(event.created_at).toLocaleDateString();
    const summary = event.event_summary || formatEventSummary(event);
    return `${date}: ${summary}`;
  });

  const eventsText = eventSummaries.join("\n");

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a roofing sales analyst. Analyze the chronological timeline of events for a roofing job and provide a concise, story-like summary (2-3 sentences) that explains what happened with this job. Focus on: interest level changes, communication patterns, momentum shifts, risk factors, and outcome. Write in a clear, professional tone that helps owners and estimators understand the full story.",
        },
        {
          role: "user",
          content: `Generate a quick summary of this job timeline:\n\n${eventsText}\n\nProvide a concise narrative summary (2-3 sentences) that tells the story of what happened with this job.`,
        },
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    const summary = completion.choices[0]?.message?.content || "Unable to generate summary.";

    return NextResponse.json({ summary });
  } catch (error: any) {
    console.error("OpenAI API error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to generate summary" },
      { status: 500 }
    );
  }
}

function formatEventSummary(event: any): string {
  const type = event.event_type;
  const data = event.event_data || {};

  switch (type) {
    case "homeowner_reply":
      return "Homeowner replied";
    case "estimator_reply":
      return "Estimator replied";
    case "tone_detected":
      return `Tone detected: ${data.tone || "unknown"}`;
    case "intent_detected":
      return `Intent detected: ${data.intent || "unknown"}`;
    case "job_probability_updated":
      return `Probability updated: ${data.new_probability || data.probability || "unknown"}%`;
    case "momentum_update":
      return `Momentum: ${data.momentum || "unknown"}`;
    case "risk_detected":
      return `Risk flagged: ${data.risk_level || "unknown"}`;
    case "proposal_sent":
      return "Proposal sent";
    case "estimate_completed":
      return "Estimate completed";
    case "job_won":
      return `Job won${data.value ? ` ($${data.value})` : ""}`;
    case "job_lost":
      return `Job lost${data.reason ? ` (${data.reason})` : ""}`;
    case "lead_routed":
      return `Lead routed${data.estimator_name ? ` to ${data.estimator_name}` : ""}`;
    default:
      return type.replace(/_/g, " ");
  }
}
