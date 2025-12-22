// Block 21140 — SmartSend Proposal Follow-Up Brain v2
// Manage individual follow-up messages

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/inbox/proposals/[proposalId]/followup/[followupId]
 * Update a follow-up (reschedule, cancel, send now)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { proposalId: string; followupId: string } }
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

    const { proposalId, followupId } = params;
    const body = await req.json();
    const { action, scheduled_at } = body; // action: 'send_now', 'reschedule', 'cancel'

    // Get follow-up
    const { data: followup, error: followupError } = await supabase
      .from("proposal_followups")
      .select("*")
      .eq("id", followupId)
      .eq("proposal_id", proposalId)
      .single();

    if (followupError || !followup) {
      return NextResponse.json(
        { error: "Follow-up not found" },
        { status: 404 }
      );
    }

    let updateData: any = {};

    switch (action) {
      case "send_now":
        updateData = {
          status: "sent",
          sent_at: new Date().toISOString(),
        };
        // Update proposal
        await supabase
          .from("proposals")
          .update({
            last_followup_sent_at: new Date().toISOString(),
            next_followup_scheduled_at: null,
          })
          .eq("id", proposalId);
        break;

      case "reschedule":
        if (!scheduled_at) {
          return NextResponse.json(
            { error: "scheduled_at is required for reschedule" },
            { status: 400 }
          );
        }
        updateData = {
          scheduled_at: scheduled_at,
        };
        // Update proposal
        await supabase
          .from("proposals")
          .update({
            next_followup_scheduled_at: scheduled_at,
          })
          .eq("id", proposalId);
        break;

      case "cancel":
        updateData = {
          status: "cancelled",
        };
        break;

      default:
        return NextResponse.json(
          { error: "Invalid action. Use: send_now, reschedule, or cancel" },
          { status: 400 }
        );
    }

    const { data: updatedFollowup, error: updateError } = await supabase
      .from("proposal_followups")
      .update(updateData)
      .eq("id", followupId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating follow-up:", updateError);
      return NextResponse.json(
        { error: "Failed to update follow-up" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      followup: updatedFollowup,
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
 * DELETE /api/inbox/proposals/[proposalId]/followup/[followupId]
 * Delete a follow-up
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { proposalId: string; followupId: string } }
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

    const { proposalId, followupId } = params;

    const { error: deleteError } = await supabase
      .from("proposal_followups")
      .delete()
      .eq("id", followupId)
      .eq("proposal_id", proposalId);

    if (deleteError) {
      console.error("Error deleting follow-up:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete follow-up" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
















































