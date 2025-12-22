// Block 35801 — SmartSend Roofing "Smart Reputation Engine + Review Booster v1"
// API Route: Get Review Dashboard Metrics
// GET /api/reviews/dashboard

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const searchParams = req.nextUrl.searchParams;
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    // Get workspace_id from user session
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspace
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!workspaceMember) {
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 404 }
      );
    }

    const workspaceId = workspaceMember.workspace_id;

    // Call database function to get metrics
    const { data: metrics, error: metricsError } = await supabase.rpc(
      "get_review_dashboard_metrics",
      {
        p_workspace_id: workspaceId,
        p_start_date: startDate || null,
        p_end_date: endDate || null,
      }
    );

    if (metricsError) {
      console.error("Error fetching dashboard metrics:", metricsError);
      return NextResponse.json(
        { error: metricsError.message || "Failed to fetch metrics" },
        { status: 500 }
      );
    }

    // Get recent reviews
    const { data: recentReviews, error: reviewsError } = await supabase
      .from("review_requests")
      .select(
        `
        id,
        rating,
        status,
        review_platform,
        completed_at,
        sent_at,
        leads:lead_id(
          id,
          name,
          email,
          first_name,
          last_name
        ),
        roofing_jobs:job_id(
          id,
          title,
          job_value
        )
      `
      )
      .eq("workspace_id", workspaceId)
      .order("sent_at", { ascending: false })
      .limit(20);

    if (reviewsError) {
      console.error("Error fetching recent reviews:", reviewsError);
    }

    // Get recent referral leads
    const { data: referralLeads, error: referralsError } = await supabase
      .from("referral_leads")
      .select(
        `
        id,
        referred_name,
        referred_phone,
        referred_email,
        status,
        job_value,
        created_at,
        source_lead_id
      `
      )
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (referralsError) {
      console.error("Error fetching referral leads:", referralsError);
    }

    return NextResponse.json({
      success: true,
      metrics: metrics || {},
      recent_reviews: recentReviews || [],
      referral_leads: referralLeads || [],
    });
  } catch (error: any) {
    console.error("Error fetching dashboard:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































