// Block 22261 — SmartSend Roofing Proposal Intelligence v1
// API Route: Create Proposal
// Creates a new proposal and logs the event

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { lead_id, workspace_id, amount, proposal_url, notes } = await req.json();

    if (!lead_id || !workspace_id || !amount) {
      return NextResponse.json(
        { error: "lead_id, workspace_id, and amount are required" },
        { status: 400 }
      );
    }

    // Verify lead exists and user has access
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, workspace_id")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    if (lead.workspace_id !== workspace_id) {
      return NextResponse.json(
        { error: "Lead does not belong to workspace" },
        { status: 403 }
      );
    }

    // Create proposal
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .insert({
        lead_id,
        workspace_id,
        amount: parseFloat(amount.toString()),
        proposal_url: proposal_url || null,
        notes: notes || null,
        status: "sent",
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (proposalError) {
      console.error("Error creating proposal:", proposalError);
      return NextResponse.json(
        { error: "Failed to create proposal", details: proposalError.message },
        { status: 500 }
      );
    }

    // Log proposal_sent event
    const { error: eventError } = await supabase
      .from("proposal_events")
      .insert({
        proposal_id: proposal.id,
        lead_id,
        workspace_id,
        event_type: "proposal_sent",
        metadata: {
          amount: proposal.amount,
          proposal_url: proposal.proposal_url,
        },
      });

    if (eventError) {
      console.error("Error logging proposal event:", eventError);
      // Don't fail the request if event logging fails
    }

    // Add to lead timeline if table exists
    try {
      await supabase
        .from("lead_timeline_events")
        .insert({
          lead_id,
          event_type: "proposal_sent",
          event_subtype: "manual",
          message: `Proposal sent — $${proposal.amount.toLocaleString()}`,
          metadata: {
            proposal_id: proposal.id,
            amount: proposal.amount,
          },
        });
    } catch (timelineError) {
      // Timeline table might not exist, that's okay
      console.log("Could not add to timeline:", timelineError);
    }

    return NextResponse.json({ success: true, proposal });
  } catch (error) {
    console.error("Error in create proposal API:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}








































