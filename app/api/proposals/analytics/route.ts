// Block 57000 — API Route: GET /api/proposals/analytics
// Returns proposal analytics

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Get user's workspaces
    const { data: workspaces } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id);

    const workspaceIds = workspaces?.map((w) => w.workspace_id) || [];

    if (workspaceIds.length === 0) {
      return NextResponse.json({
        analytics: {
          total_proposals: 0,
          sent_count: 0,
          viewed_count: 0,
          signed_count: 0,
          view_rate: 0,
          signature_rate: 0,
          upsell_acceptance_rate: 0,
          revenue_closed_this_month: 0,
          average_proposal_value: 0,
        },
      });
    }

    // Get all proposals
    const { data: proposals, error: proposalsError } = await supabase
      .from("proposals")
      .select("status, total_price, viewed_at, signed_at, upsells, created_at")
      .in("workspace_id", workspaceIds);

    if (proposalsError) {
      console.error("Error fetching proposals:", proposalsError);
      return NextResponse.json(
        { error: "Failed to fetch proposals" },
        { status: 500 }
      );
    }

    const allProposals = proposals || [];
    const sentProposals = allProposals.filter((p) => p.status === "sent" || p.status === "viewed" || p.status === "signed");
    const viewedProposals = allProposals.filter((p) => p.viewed_at !== null);
    const signedProposals = allProposals.filter((p) => p.signed_at !== null || p.status === "signed");

    // Calculate upsell acceptance rate
    const proposalsWithUpsells = allProposals.filter((p) => p.upsells && Array.isArray(p.upsells) && p.upsells.length > 0);
    const upsellAcceptanceRate = sentProposals.length > 0
      ? (proposalsWithUpsells.length / sentProposals.length) * 100
      : 0;

    // Calculate revenue this month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const revenueThisMonth = signedProposals
      .filter((p) => {
        const signedDate = p.signed_at ? new Date(p.signed_at) : null;
        return signedDate && signedDate >= startOfMonth;
      })
      .reduce((sum, p) => sum + (p.total_price || 0), 0);

    // Calculate average proposal value
    const signedWithPrice = signedProposals.filter((p) => p.total_price && p.total_price > 0);
    const averageProposalValue = signedWithPrice.length > 0
      ? signedWithPrice.reduce((sum, p) => sum + (p.total_price || 0), 0) / signedWithPrice.length
      : 0;

    const analytics = {
      total_proposals: allProposals.length,
      sent_count: sentProposals.length,
      viewed_count: viewedProposals.length,
      signed_count: signedProposals.length,
      view_rate: sentProposals.length > 0 ? (viewedProposals.length / sentProposals.length) * 100 : 0,
      signature_rate: viewedProposals.length > 0 ? (signedProposals.length / viewedProposals.length) * 100 : 0,
      upsell_acceptance_rate: upsellAcceptanceRate,
      revenue_closed_this_month: revenueThisMonth,
      average_proposal_value: averageProposalValue,
    };

    return NextResponse.json({ analytics });
  } catch (error) {
    console.error("Error in /api/proposals/analytics:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
































