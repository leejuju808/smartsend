import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

/**
 * GET /api/review-referral/dashboard
 * Block 24540: Returns review & referral dashboard metrics
 * Shows reviews, referrals, and sequence stats for the workspace
 */
export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspace
  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  const workspaceId = profile?.workspace_id;
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  try {
    // Call the database function to get dashboard data
    const { data: dashboardData, error } = await supabase.rpc(
      'get_review_referral_dashboard',
      { p_workspace_id: workspaceId }
    );

    if (error) {
      console.error("Error fetching review/referral dashboard:", error);
      throw error;
    }

    return NextResponse.json({
      ok: true,
      data: dashboardData,
      calculatedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("Review/referral dashboard error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to load review/referral dashboard" },
      { status: 500 }
    );
  }
}






































