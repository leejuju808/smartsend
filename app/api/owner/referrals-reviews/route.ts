// Block 27400 — SmartSend Roofing Referral & Review Engine v1
// API Route: Owner Referrals & Reviews Dashboard
// GET /api/owner/referrals-reviews

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createServerClient();

    // Ensure user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspace
    const { data: membership, error: memError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (memError || !membership) {
      return NextResponse.json({ error: "No workspace found" }, { status: 404 });
    }

    const workspaceId = membership.workspace_id;

    // Use service role for queries
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000)
      .toISOString()
      .slice(0, 10);

    // Get completed jobs in last 90 days
    const { data: jobs } = await serviceSupabase
      .from("roofing_jobs")
      .select("id")
      .eq("status", "completed")
      .eq("workspace_id", workspaceId)
      .gte("completed_at", ninetyDaysAgo);

    const completed_jobs_90d = jobs?.length || 0;

    // Get review requests sent
    const { data: reviewReqs } = await serviceSupabase
      .from("roofing_review_requests")
      .select("id, status, completed_at")
      .in(
        "job_id",
        jobs?.map((j) => j.id) || []
      );

    const review_requests_sent = reviewReqs?.length || 0;
    const reviews_completed = reviewReqs?.filter((r) => r.status === "completed").length || 0;

    // Get referrals
    const { data: referrals } = await serviceSupabase
      .from("roofing_referrals")
      .select(`
        id,
        referrer_job_id,
        referred_name,
        referred_email,
        referred_phone,
        referred_address,
        status,
        linked_lead_id,
        created_at,
        roofing_jobs!referrer_job_id(
          homeowner_name
        ),
        roofing_customers!referrer_customer_id(
          customer_name
        )
      `)
      .in(
        "referrer_job_id",
        jobs?.map((j) => j.id) || []
      )
      .order("created_at", { ascending: false })
      .limit(50);

    const referrals_count = referrals?.length || 0;

    // Get converted referrals
    const { data: converted } = await serviceSupabase
      .from("roofing_referrals")
      .select("id")
      .in(
        "referrer_job_id",
        jobs?.map((j) => j.id) || []
      )
      .eq("status", "converted");

    const referral_conversion_rate =
      referrals_count === 0
        ? 0
        : Math.round(((converted?.length || 0) / referrals_count) * 100);

    // Format referrals for display
    const formattedReferrals = (referrals || []).map((r: any) => ({
      id: r.id,
      referrer_name:
        r.roofing_customers?.customer_name ||
        r.roofing_jobs?.homeowner_name ||
        "Unknown",
      referred_name: r.referred_name,
      referred_email: r.referred_email,
      referred_phone: r.referred_phone,
      referred_address: r.referred_address,
      status: r.status,
      linked_lead_id: r.linked_lead_id,
      created_at: r.created_at,
    }));

    return NextResponse.json({
      stats: {
        completed_jobs_90d,
        review_requests_sent,
        reviews_completed,
        referrals_count,
        referral_conversion_rate,
      },
      referrals: formattedReferrals,
    });
  } catch (error) {
    console.error("Error in referrals-reviews API:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}



































