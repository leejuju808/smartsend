// Block 36110 — SmartSend Roofing "Proposal Builder + Instant Quote Engine" v1
// API Route: Proposal Tracking
// POST /api/proposals/[id]/track

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createClient();

    const body = await req.json();
    const { event_type, metadata = {} } = body;

    if (!event_type) {
      return NextResponse.json(
        { error: "event_type is required" },
        { status: 400 }
      );
    }

    // Verify proposal exists
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .select("id, status")
      .eq("id", id)
      .single();

    if (proposalError || !proposal) {
      return NextResponse.json(
        { error: "Proposal not found" },
        { status: 404 }
      );
    }

    // Insert tracking event
    const { data: event, error: eventError } = await supabase
      .from("proposal_events")
      .insert({
        proposal_id: id,
        event_type,
        metadata,
      })
      .select()
      .single();

    if (eventError) {
      console.error("Error tracking proposal event:", eventError);
      return NextResponse.json(
        { error: "Failed to track event", details: eventError.message },
        { status: 500 }
      );
    }

    // If this is a view event, the trigger will handle updating viewed_count
    // But we can also return updated proposal data
    const { data: updatedProposal } = await supabase
      .from("proposals")
      .select("id, viewed_count, last_viewed_at, status")
      .eq("id", id)
      .single();

    return NextResponse.json({
      ok: true,
      event,
      proposal: updatedProposal,
    });
  } catch (error: any) {
    console.error("Error in /api/proposals/[id]/track:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/proposals/[id]/track - Get tracking analytics
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createClient();

    // Get proposal with events
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .select("*, proposal_events(*), proposal_signatures(*)")
      .eq("id", id)
      .single();

    if (proposalError || !proposal) {
      return NextResponse.json(
        { error: "Proposal not found" },
        { status: 404 }
      );
    }

    // Calculate analytics
    const events = proposal.proposal_events || [];
    const viewEvents = events.filter((e: any) => e.event_type === "viewed");
    const signatureEvents = events.filter((e: any) => e.event_type === "signed");
    const financingClicks = events.filter((e: any) => e.event_type === "financing_clicked");

    const analytics = {
      total_views: proposal.viewed_count || 0,
      view_events: viewEvents.length,
      last_viewed_at: proposal.last_viewed_at,
      is_signed: signatureEvents.length > 0,
      signed_at: proposal.signed_at,
      financing_clicks: financingClicks.length,
      total_events: events.length,
      events_by_type: events.reduce((acc: any, event: any) => {
        acc[event.event_type] = (acc[event.event_type] || 0) + 1;
        return acc;
      }, {}),
    };

    return NextResponse.json({
      ok: true,
      proposal: {
        id: proposal.id,
        status: proposal.status,
        viewed_count: proposal.viewed_count,
        last_viewed_at: proposal.last_viewed_at,
        signed_at: proposal.signed_at,
      },
      analytics,
      events: events.slice(0, 50), // Return last 50 events
    });
  } catch (error: any) {
    console.error("Error in GET /api/proposals/[id]/track:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
