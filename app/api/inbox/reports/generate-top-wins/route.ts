// app/api/inbox/reports/generate-top-wins/route.ts
// Block 19760 — Inbox Success Tracking & Feedback Loop v1
// API endpoint for generating weekly Top Wins reports

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { week_start, week_end, user_id, workspace_id } = body;

    if (!week_start || !week_end) {
      return NextResponse.json(
        { error: "week_start and week_end are required" },
        { status: 400 }
      );
    }

    // Calculate week metrics
    const weekStartDate = new Date(week_start);
    const weekEndDate = new Date(week_end);

    // Get replies handled count
    const { data: replies } = await supabase
      .from("inbox_messages")
      .select("id")
      .gte("received_at", weekStartDate.toISOString())
      .lte("received_at", weekEndDate.toISOString());

    // Get hot leads detected
    const { data: hotLeads } = await supabase
      .from("inbox_messages")
      .select("id")
      .eq("ai_intent", "hot")
      .gte("received_at", weekStartDate.toISOString())
      .lte("received_at", weekEndDate.toISOString());

    // Get booked jobs
    const { data: bookedActions } = await supabase
      .from("inbox_actions")
      .select("id, metadata")
      .eq("action_type", "mark_booked")
      .gte("created_at", weekStartDate.toISOString())
      .lte("created_at", weekEndDate.toISOString());

    // Calculate estimated total job value
    let estimatedTotalJobValue = 0;
    if (bookedActions) {
      bookedActions.forEach((action) => {
        const jobValue = action.metadata?.job_value || 0;
        estimatedTotalJobValue += jobValue;
      });
    }

    // Get tasks created
    const { data: tasks } = await supabase
      .from("inbox_actions")
      .select("id")
      .eq("action_type", "add_task")
      .gte("created_at", weekStartDate.toISOString())
      .lte("created_at", weekEndDate.toISOString());

    // Get notifications sent (from usage events)
    const { data: notifications } = await supabase
      .from("inbox_usage_events")
      .select("id")
      .eq("event_type", "notification_fired")
      .gte("event_timestamp", weekStartDate.toISOString())
      .lte("event_timestamp", weekEndDate.toISOString());

    // Get adoption curves (sessions over time)
    const { data: sessions } = await supabase
      .from("inbox_usage_events")
      .select("event_timestamp, session_id")
      .eq("event_type", "thread_opened")
      .gte("event_timestamp", weekStartDate.toISOString())
      .lte("event_timestamp", weekEndDate.toISOString())
      .order("event_timestamp", { ascending: true });

    // Calculate sentiment from feedback
    const { data: feedback } = await supabase
      .from("inbox_feedback")
      .select("question_2_help, question_1_confusion")
      .gte("created_at", weekStartDate.toISOString())
      .lte("created_at", weekEndDate.toISOString());

    let positiveCount = 0;
    let negativeCount = 0;
    let neutralCount = 0;

    if (feedback) {
      feedback.forEach((f) => {
        if (f.question_2_help && f.question_2_help.length > 0) {
          positiveCount++;
        } else if (f.question_1_confusion && f.question_1_confusion.length > 0) {
          negativeCount++;
        } else {
          neutralCount++;
        }
      });
    }

    const totalFeedback = positiveCount + negativeCount + neutralCount;
    const sentimentScore =
      totalFeedback > 0
        ? (positiveCount / totalFeedback) * 0.5 + 0.5 // Scale to 0.5-1.0
        : 0.75; // Default neutral-positive

    // Build adoption curves data
    const adoptionCurves: { [key: string]: number } = {};
    if (sessions) {
      sessions.forEach((session) => {
        const date = new Date(session.event_timestamp).toISOString().split("T")[0];
        adoptionCurves[date] = (adoptionCurves[date] || 0) + 1;
      });
    }

    // Build report data
    const reportData = {
      replies_handled_count: replies?.length || 0,
      hot_leads_detected_count: hotLeads?.length || 0,
      booked_jobs_created_count: bookedActions?.length || 0,
      estimated_total_job_value: estimatedTotalJobValue,
      tasks_created_count: tasks?.length || 0,
      notifications_sent_count: notifications?.length || 0,
      adoption_curves: adoptionCurves,
      sentiment_score: sentimentScore,
      positive_feedback_count: positiveCount,
      negative_feedback_count: negativeCount,
      neutral_feedback_count: neutralCount,
    };

    // Insert or update report
    const { data: existingReport } = await supabase
      .from("inbox_top_wins_reports")
      .select("id")
      .eq("user_id", user_id || user.id)
      .eq("workspace_id", workspace_id || null)
      .eq("week_start", weekStartDate.toISOString())
      .single();

    const reportPayload = {
      user_id: user_id || user.id,
      workspace_id: workspace_id || null,
      week_start: weekStartDate.toISOString(),
      week_end: weekEndDate.toISOString(),
      replies_handled_count: reportData.replies_handled_count,
      hot_leads_detected_count: reportData.hot_leads_detected_count,
      booked_jobs_created_count: reportData.booked_jobs_created_count,
      estimated_total_job_value: reportData.estimated_total_job_value,
      tasks_created_count: reportData.tasks_created_count,
      notifications_sent_count: reportData.notifications_sent_count,
      adoption_curves: adoptionCurves,
      sentiment_score: sentimentScore,
      positive_feedback_count: positiveCount,
      negative_feedback_count: negativeCount,
      neutral_feedback_count: neutralCount,
      report_data: reportData,
    };

    let result;
    if (existingReport) {
      const { data, error } = await supabase
        .from("inbox_top_wins_reports")
        .update(reportPayload)
        .eq("id", existingReport.id)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from("inbox_top_wins_reports")
        .insert(reportPayload)
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error("Error generating top wins report:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



















































