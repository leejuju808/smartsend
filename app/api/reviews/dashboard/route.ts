// Block 56000 — SmartSend Roofing "Customer Review + Reputation Automation System" v1
// API Route: Reputation Dashboard Data
// GET /api/reviews/dashboard
// Returns metrics, recent feedback, testimonials, and trend data

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();

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

    // Get workspace_id from query params
    const { searchParams } = new URL(req.url);
    const workspace_id = searchParams.get("workspace_id");

    if (!workspace_id) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Get current metrics (latest day)
    const { data: latestMetrics } = await supabase
      .from("reputation_metrics")
      .select("*")
      .eq("workspace_id", workspace_id)
      .order("date", { ascending: false })
      .limit(1)
      .single();

    // Get recent feedback (last 30 days)
    const { data: recentFeedback } = await supabase
      .from("review_requests")
      .select(`
        id,
        job_id,
        response_rating,
        feedback,
        review_stage,
        sent_at,
        created_at,
        job:job_id(
          title
        ),
        homeowner:homeowner_id(
          name,
          email
        )
      `)
      .eq("workspace_id", workspace_id)
      .not("response_rating", "is", null)
      .order("created_at", { ascending: false })
      .limit(20);

    // Get testimonials
    const { data: testimonials } = await supabase
      .from("testimonials")
      .select(`
        id,
        content,
        rating,
        homeowner_name,
        photo_url,
        approved,
        created_at,
        job:job_id(
          title
        )
      `)
      .eq("workspace_id", workspace_id)
      .order("created_at", { ascending: false })
      .limit(50);

    // Get trend data (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: trendData } = await supabase
      .from("reputation_metrics")
      .select("date, avg_rating, total_reviews, satisfaction_rate")
      .eq("workspace_id", workspace_id)
      .gte("date", thirtyDaysAgo.toISOString().split("T")[0])
      .order("date", { ascending: true });

    return NextResponse.json(
      {
        metrics: latestMetrics || {
          total_reviews: 0,
          total_requests_sent: 0,
          total_responses: 0,
          avg_rating: 0,
          google_reviews_sent: 0,
          google_reviews_submitted: 0,
          internal_feedback_count: 0,
          testimonials_collected: 0,
          testimonials_approved: 0,
          satisfaction_rate: 0,
          response_rate: 0,
        },
        recent_feedback: recentFeedback || [],
        testimonials: testimonials || [],
        trend: trendData || [],
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error fetching reputation dashboard data:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































