// Block 25940 — Proposal Analytics Tracking
// Track proposal views, tier interactions, photo views, etc.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/inbox/proposals/[proposalId]/analytics
 * Track proposal interaction
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  try {
    const supabase = createClient();
    const { proposalId } = params;
    const body = await req.json();

    const {
      action_type,
      tier_viewed,
      photo_viewed_url,
      upgrade_id,
      section_viewed,
      action_metadata,
    } = body;

    if (!action_type) {
      return NextResponse.json({ error: "action_type is required" }, { status: 400 });
    }

    // Insert analytics event
    const { data: analytics, error: analyticsError } = await supabase
      .from("proposal_analytics")
      .insert({
        proposal_id: proposalId,
        action_type,
        tier_viewed,
        photo_viewed_url,
        upgrade_id,
        section_viewed,
        action_metadata: action_metadata || {},
      })
      .select()
      .single();

    if (analyticsError) {
      console.error("Error creating analytics:", analyticsError);
      return NextResponse.json(
        { error: "Failed to track analytics" },
        { status: 500 }
      );
    }

    // Update proposal analytics summary
    const { data: proposal } = await supabase
      .from("proposals")
      .select("analytics")
      .eq("id", proposalId)
      .single();

    if (proposal) {
      const currentAnalytics = proposal.analytics || {
        views: 0,
        tier_views: { good: 0, better: 0, best: 0 },
        photo_views: {},
        upgrade_interest: {},
      };

      // Update analytics summary
      if (action_type === "view") {
        currentAnalytics.views = (currentAnalytics.views || 0) + 1;
        if (!currentAnalytics.first_viewed_at) {
          currentAnalytics.first_viewed_at = new Date().toISOString();
        }
        currentAnalytics.last_viewed_at = new Date().toISOString();
      }

      if (action_type === "tier_view" && tier_viewed) {
        currentAnalytics.tier_views = currentAnalytics.tier_views || { good: 0, better: 0, best: 0 };
        currentAnalytics.tier_views[tier_viewed] = (currentAnalytics.tier_views[tier_viewed] || 0) + 1;
      }

      if (action_type === "photo_view" && photo_viewed_url) {
        currentAnalytics.photo_views = currentAnalytics.photo_views || {};
        currentAnalytics.photo_views[photo_viewed_url] = (currentAnalytics.photo_views[photo_viewed_url] || 0) + 1;
      }

      if (action_type === "upgrade_view" && upgrade_id) {
        currentAnalytics.upgrade_interest = currentAnalytics.upgrade_interest || {};
        currentAnalytics.upgrade_interest[upgrade_id] = (currentAnalytics.upgrade_interest[upgrade_id] || 0) + 1;
      }

      // Update proposal
      await supabase
        .from("proposals")
        .update({ analytics: currentAnalytics })
        .eq("id", proposalId);
    }

    return NextResponse.json({ analytics, success: true });
  } catch (error) {
    console.error("Error in proposal analytics:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/inbox/proposals/[proposalId]/analytics
 * Get proposal analytics summary
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  try {
    const supabase = createClient();
    const { proposalId } = params;

    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .select("analytics")
      .eq("id", proposalId)
      .single();

    if (proposalError || !proposal) {
      return NextResponse.json(
        { error: "Proposal not found" },
        { status: 404 }
      );
    }

    // Get detailed analytics events
    const { data: events } = await supabase
      .from("proposal_analytics")
      .select("*")
      .eq("proposal_id", proposalId)
      .order("created_at", { ascending: false })
      .limit(100);

    return NextResponse.json({
      summary: proposal.analytics || {},
      events: events || [],
      success: true,
    });
  } catch (error) {
    console.error("Error fetching proposal analytics:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}




































