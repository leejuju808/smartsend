// Block 21140 — SmartSend Proposal Follow-Up Brain v2
// Track proposal viewing/interaction events

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/inbox/proposals/[proposalId]/events
 * Record a proposal event (opened, forwarded, downloaded, etc.)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { proposalId } = params;
    const body = await req.json();
    const { event_type, metadata } = body;

    if (!event_type) {
      return NextResponse.json(
        { error: "event_type is required" },
        { status: 400 }
      );
    }

    // Validate event type
    const validEventTypes = [
      "opened",
      "reopened",
      "forwarded",
      "forwarded_to_spouse",
      "forwarded_to_adjuster",
      "downloaded",
      "clicked",
      "viewed_on_phone",
      "viewed_on_desktop",
      "left_unread",
    ];

    if (!validEventTypes.includes(event_type)) {
      return NextResponse.json(
        { error: `Invalid event_type. Must be one of: ${validEventTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Get proposal data
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .select("thread_id, contact_id, workspace_id")
      .eq("id", proposalId)
      .single();

    if (proposalError || !proposal) {
      return NextResponse.json(
        { error: "Proposal not found" },
        { status: 404 }
      );
    }

    // Create event
    const { data: event, error: eventError } = await supabase
      .from("proposal_events")
      .insert({
        proposal_id: proposalId,
        thread_id: proposal.thread_id,
        contact_id: proposal.contact_id,
        workspace_id: proposal.workspace_id,
        event_type,
        metadata: metadata || {},
      })
      .select()
      .single();

    if (eventError) {
      console.error("Error creating event:", eventError);
      return NextResponse.json(
        { error: "Failed to create event" },
        { status: 500 }
      );
    }

    // Analytics update is handled by trigger
    // But we can also trigger a follow-up check if needed
    if (event_type === "reopened" || event_type === "opened") {
      // Check if we should schedule a follow-up
      const { data: timing } = await supabase.rpc("calculate_followup_timing", {
        p_proposal_id: proposalId,
      });

      if (timing?.urgency_level === "high") {
        // Could auto-schedule a follow-up here if desired
        // For now, we'll just return the timing info
      }
    }

    return NextResponse.json({
      success: true,
      event,
    });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/inbox/proposals/[proposalId]/events
 * Get all events for a proposal
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { proposalId } = params;

    const { data: events, error: eventsError } = await supabase
      .from("proposal_events")
      .select("*")
      .eq("proposal_id", proposalId)
      .order("event_timestamp", { ascending: false });

    if (eventsError) {
      console.error("Error fetching events:", eventsError);
      return NextResponse.json(
        { error: "Failed to fetch events" },
        { status: 500 }
      );
    }

    return NextResponse.json({ events });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
















































