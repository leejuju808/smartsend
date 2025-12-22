// Block 94000 — Customer Experience Dashboard API
// GET /api/experience/dashboard
// Returns experience metrics, feedback, and at-risk jobs for internal dashboard

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Get all portals for this workspace
    const { data: portals, error: portalsError } = await supabase
      .from("homeowner_portals")
      .select("id, job_id")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true);

    if (portalsError) {
      console.error("Error fetching portals:", portalsError);
      return NextResponse.json(
        { error: "Failed to fetch portals" },
        { status: 500 }
      );
    }

    const portalIds = (portals || []).map((p) => p.id);
    const jobIds = (portals || []).map((p) => p.job_id);

    if (portalIds.length === 0) {
      return NextResponse.json({
        metrics: {
          avg_rating: 0,
          total_feedback: 0,
          promoters_count: 0,
          at_risk_count: 0,
          trend: "stable",
          trend_percent: 0,
        },
        recent_feedback: [],
        unread_messages: [],
        at_risk_jobs: [],
        promoters: [],
      });
    }

    // Get feedback events (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: allFeedback, error: feedbackError } = await supabase
      .from("experience_feedback_events")
      .select("*")
      .in("portal_id", portalIds)
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: false });

    if (feedbackError) {
      console.error("Error fetching feedback:", feedbackError);
    }

    // Get feedback from previous 30 days for trend calculation
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const { data: previousFeedback, error: prevFeedbackError } = await supabase
      .from("experience_feedback_events")
      .select("rating")
      .in("portal_id", portalIds)
      .gte("created_at", sixtyDaysAgo.toISOString())
      .lt("created_at", thirtyDaysAgo.toISOString());

    // Calculate metrics
    const feedback = allFeedback || [];
    const ratings = feedback.filter((f) => f.rating !== null).map((f) => f.rating!);
    const avgRating = ratings.length > 0
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length
      : 0;

    const promoters = feedback.filter((f) => f.is_promoter === true);
    const atRisk = feedback.filter((f) => f.is_at_risk === true);

    // Calculate trend
    const prevRatings = (previousFeedback || [])
      .filter((f) => f.rating !== null)
      .map((f) => f.rating!);
    const prevAvgRating = prevRatings.length > 0
      ? prevRatings.reduce((a, b) => a + b, 0) / prevRatings.length
      : 0;

    let trend: "up" | "down" | "stable" = "stable";
    let trendPercent = 0;
    if (prevAvgRating > 0 && avgRating > 0) {
      const diff = avgRating - prevAvgRating;
      trendPercent = Math.round((diff / prevAvgRating) * 100);
      trend = diff > 0.1 ? "up" : diff < -0.1 ? "down" : "stable";
    }

    // Get job titles for feedback
    const { data: jobs, error: jobsError } = await supabase
      .from("roofing_jobs")
      .select("id, title, homeowner_name")
      .in("id", jobIds);

    const jobMap = new Map();
    (jobs || []).forEach((job) => {
      jobMap.set(job.id, { title: job.title, homeowner_name: job.homeowner_name });
    });

    // Enrich feedback with job info
    const enrichedFeedback = (feedback || []).slice(0, 20).map((f) => {
      const jobInfo = jobMap.get(f.job_id) || {};
      return {
        ...f,
        job_title: jobInfo.title,
        homeowner_name: jobInfo.homeowner_name,
      };
    });

    // Get at-risk jobs (jobs with ≤6 rating)
    const atRiskJobIds = new Set(atRisk.map((f) => f.job_id));
    const atRiskJobsData = Array.from(atRiskJobIds).map((jobId) => {
      const jobFeedback = feedback.filter((f) => f.job_id === jobId);
      const lowestRating = Math.min(...jobFeedback.map((f) => f.rating || 10));
      const latestFeedback = jobFeedback
        .filter((f) => f.comment)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      
      const jobInfo = jobMap.get(jobId) || {};
      return {
        job_id: jobId,
        job_title: jobInfo.title,
        homeowner_name: jobInfo.homeowner_name,
        lowest_rating: lowestRating,
        feedback_count: jobFeedback.length,
        latest_feedback: latestFeedback?.comment || "No comment provided",
      };
    });

    // Get promoters (9-10 ratings)
    const enrichedPromoters = promoters.slice(0, 20).map((f) => {
      const jobInfo = jobMap.get(f.job_id) || {};
      return {
        ...f,
        job_title: jobInfo.title,
        homeowner_name: jobInfo.homeowner_name,
      };
    });

    // Get unread homeowner messages
    const { data: unreadMessages, error: messagesError } = await supabase
      .from("homeowner_messages")
      .select("*")
      .in("job_id", jobIds)
      .eq("direction", "incoming")
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(50);

    const enrichedMessages = (unreadMessages || []).map((m) => {
      const jobInfo = jobMap.get(m.job_id) || {};
      return {
        ...m,
        job_title: jobInfo.title,
      };
    });

    return NextResponse.json({
      metrics: {
        avg_rating: Math.round(avgRating * 10) / 10,
        total_feedback: feedback.length,
        promoters_count: promoters.length,
        at_risk_count: atRisk.length,
        trend,
        trend_percent: Math.abs(trendPercent),
      },
      recent_feedback: enrichedFeedback,
      unread_messages: enrichedMessages,
      at_risk_jobs: atRiskJobsData,
      promoters: enrichedPromoters,
    });
  } catch (error: any) {
    console.error("Error in experience dashboard API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























