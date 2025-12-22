// app/api/internal/inbox-health/route.ts
// Block 19760 — Inbox Success Tracking & Feedback Loop v1
// Internal Inbox Health Dashboard API endpoint

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Check cache first
    const { data: cachedData } = await supabase
      .from("inbox_health_dashboard_cache")
      .select("*")
      .eq("cache_key", "all_users")
      .gt("expires_at", new Date().toISOString())
      .single();

    if (cachedData) {
      return NextResponse.json({ success: true, data: cachedData, cached: true });
    }

    // Calculate dashboard metrics
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Hot lead detection accuracy
    const { data: intentCorrections } = await supabase
      .from("inbox_usage_events")
      .select("metadata")
      .eq("event_type", "intent_manually_corrected")
      .gte("event_timestamp", thirtyDaysAgo.toISOString());

    const { data: totalClassifications } = await supabase
      .from("inbox_messages")
      .select("id, ai_intent")
      .not("ai_intent", "is", null)
      .gte("created_at", thirtyDaysAgo.toISOString());

    const hotLeadDetectionAccuracy =
      totalClassifications && totalClassifications.length > 0
        ? ((totalClassifications.length - (intentCorrections?.length || 0)) /
            totalClassifications.length) *
          100
        : 0;

    // Thread creation stats
    const { data: threadStats } = await supabase
      .from("inbox_threads")
      .select("id, created_at, status")
      .gte("created_at", thirtyDaysAgo.toISOString());

    // Orphan reply count
    const { data: orphanReplies } = await supabase
      .from("inbox_usage_events")
      .select("id")
      .eq("event_type", "orphan_reply_assignments")
      .gte("event_timestamp", thirtyDaysAgo.toISOString());

    // Inbox adoption charts (sessions over time)
    const { data: sessions } = await supabase
      .from("inbox_usage_events")
      .select("event_timestamp, session_id")
      .eq("event_type", "thread_opened")
      .gte("event_timestamp", thirtyDaysAgo.toISOString())
      .order("event_timestamp", { ascending: true });

    // Top 5 friction points (from feedback)
    const { data: frictionFeedback } = await supabase
      .from("inbox_feedback")
      .select("question_1_confusion")
      .not("question_1_confusion", "is", null)
      .gte("created_at", thirtyDaysAgo.toISOString())
      .limit(100);

    // Top 5 requested improvements
    const { data: improvements } = await supabase
      .from("inbox_feedback")
      .select("question_3_improvement, question_3_other_text")
      .not("question_3_improvement", "is", null)
      .gte("created_at", thirtyDaysAgo.toISOString())
      .limit(100);

    // Mobile vs desktop usage
    const { data: mobileEvents } = await supabase
      .from("inbox_usage_events")
      .select("id, is_mobile")
      .gte("event_timestamp", thirtyDaysAgo.toISOString());

    const mobileCount = mobileEvents?.filter((e) => e.is_mobile).length || 0;
    const desktopCount = (mobileEvents?.length || 0) - mobileCount;

    // Booked estimate counts
    const { data: bookedActions } = await supabase
      .from("inbox_actions")
      .select("id")
      .eq("action_type", "mark_booked")
      .gte("created_at", thirtyDaysAgo.toISOString());

    // Build dashboard data
    const dashboardData = {
      hot_lead_detection_accuracy: Math.round(hotLeadDetectionAccuracy * 100) / 100,
      thread_creation_stats: {
        total: threadStats?.length || 0,
        open: threadStats?.filter((t) => t.status === "open").length || 0,
        closed: threadStats?.filter((t) => t.status === "closed").length || 0,
      },
      orphan_reply_count: orphanReplies?.length || 0,
      inbox_adoption_charts: {
        sessions_over_time: sessions?.map((s) => ({
          date: s.event_timestamp,
          count: 1,
        })) || [],
      },
      top_5_friction_points: extractTopFrictionPoints(frictionFeedback || []),
      top_5_requested_improvements: extractTopImprovements(improvements || []),
      inbox_stability_score: calculateStabilityScore(),
      response_time_benchmarks: {}, // TODO: Calculate from metrics
      mobile_vs_desktop_usage: {
        mobile: mobileCount,
        desktop: desktopCount,
        mobile_percentage: mobileEvents?.length
          ? (mobileCount / mobileEvents.length) * 100
          : 0,
      },
      booked_estimate_counts: bookedActions?.length || 0,
    };

    // Cache the result
    await supabase
      .from("inbox_health_dashboard_cache")
      .upsert({
        cache_key: "all_users",
        ...dashboardData,
        cached_at: new Date().toISOString(),
        expires_at: new Date(now.getTime() + 60 * 60 * 1000).toISOString(), // 1 hour
      });

    return NextResponse.json({ success: true, data: dashboardData, cached: false });
  } catch (error: any) {
    console.error("Error fetching inbox health dashboard:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper function to extract top friction points
function extractTopFrictionPoints(feedback: any[]): any[] {
  const points: { [key: string]: number } = {};
  feedback.forEach((f) => {
    if (f.question_1_confusion) {
      const key = f.question_1_confusion.toLowerCase().trim();
      points[key] = (points[key] || 0) + 1;
    }
  });

  return Object.entries(points)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([point, count]) => ({ point, count }));
}

// Helper function to extract top improvements
function extractTopImprovements(feedback: any[]): any[] {
  const improvements: { [key: string]: number } = {};
  feedback.forEach((f) => {
    const key = f.question_3_improvement || "other";
    improvements[key] = (improvements[key] || 0) + 1;
  });

  return Object.entries(improvements)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([improvement, count]) => ({ improvement, count }));
}

// Helper function to calculate stability score
function calculateStabilityScore(): number {
  // TODO: Implement actual stability calculation
  // For now, return a placeholder
  return 95.5;
}



















































