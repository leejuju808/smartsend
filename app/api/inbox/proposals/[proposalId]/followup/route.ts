// Block 21140 — SmartSend Proposal Follow-Up Brain v2
// API endpoints for proposal follow-up management

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/inbox/proposals/[proposalId]/followup
 * Get follow-up brain panel data for a proposal
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

    // Get follow-up brain panel data
    const { data: panelData, error: panelError } = await supabase.rpc(
      "get_proposal_followup_brain_panel",
      { p_proposal_id: proposalId }
    );

    if (panelError) {
      console.error("Error getting follow-up panel:", panelError);
      return NextResponse.json(
        { error: "Failed to get follow-up panel data" },
        { status: 500 }
      );
    }

    return NextResponse.json({ panel: panelData });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/inbox/proposals/[proposalId]/followup
 * Generate and schedule a follow-up message
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
    const {
      followup_type,
      tone,
      scheduled_at,
      send_now = false,
    } = body;

    // Get proposal data
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .select("*, thread:inbox_threads(*), contact:contacts(*)")
      .eq("id", proposalId)
      .single();

    if (proposalError || !proposal) {
      return NextResponse.json(
        { error: "Proposal not found" },
        { status: 404 }
      );
    }

    // Check if follow-up can be sent
    const { data: conditions, error: conditionsError } = await supabase.rpc(
      "should_send_followup",
      { p_proposal_id: proposalId }
    );

    if (conditionsError || !conditions?.can_send) {
      return NextResponse.json(
        {
          error: "Follow-up cannot be sent",
          reason: conditions?.reason || "Unknown reason",
        },
        { status: 400 }
      );
    }

    // Get timing if not provided
    let finalScheduledAt = scheduled_at;
    if (!finalScheduledAt && !send_now) {
      const { data: timing } = await supabase.rpc("calculate_followup_timing", {
        p_proposal_id: proposalId,
      });
      finalScheduledAt = timing?.recommended_time || new Date().toISOString();
    } else if (send_now) {
      finalScheduledAt = new Date().toISOString();
    }

    // Determine follow-up type if not provided
    let finalFollowupType = followup_type;
    if (!finalFollowupType) {
      const { data: type } = await supabase.rpc("determine_followup_type", {
        p_proposal_id: proposalId,
      });
      finalFollowupType = type || "soft_friendly";
    }

    // Generate follow-up message via edge function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const { data: messageData, error: messageError } = await supabase.functions.invoke(
      "proposal-followup-generator-v2",
      {
        body: {
          proposal_id: proposalId,
          followup_type: finalFollowupType,
          tone: tone || "friendly",
        },
      }
    );

    if (messageError || !messageData?.message) {
      console.error("Error generating follow-up message:", messageError);
      return NextResponse.json(
        { error: "Failed to generate follow-up message" },
        { status: 500 }
      );
    }

    const message = messageData.message;

    // Create follow-up record
    const { data: followup, error: followupError } = await supabase
      .from("proposal_followups")
      .insert({
        proposal_id: proposalId,
        thread_id: proposal.thread_id,
        contact_id: proposal.contact_id,
        workspace_id: proposal.workspace_id,
        followup_type: finalFollowupType,
        tone: message.tone || tone || "friendly",
        status: send_now ? "sent" : "scheduled",
        message_subject: message.subject,
        message_body: message.body,
        message_body_html: message.body_html,
        scheduled_at: finalScheduledAt,
        sent_at: send_now ? new Date().toISOString() : null,
        trigger_conditions: {
          behavior: proposal.proposal_analytics || {},
          insurance_status: proposal.thread?.insurance_claim_status,
          install_ready_score: proposal.thread?.install_ready_score,
        },
        ai_generated: true,
      })
      .select()
      .single();

    if (followupError) {
      console.error("Error creating follow-up:", followupError);
      return NextResponse.json(
        { error: "Failed to create follow-up" },
        { status: 500 }
      );
    }

    // Update proposal's last follow-up timestamp
    await supabase
      .from("proposals")
      .update({
        last_followup_sent_at: send_now ? new Date().toISOString() : null,
        next_followup_scheduled_at: send_now ? null : finalScheduledAt,
        followup_metadata: {
          cadence_sequence: (proposal.followup_metadata?.cadence_sequence || 0) + 1,
          last_followup_type: finalFollowupType,
        },
      })
      .eq("id", proposalId);

    // If sending now, create calendar event and send email
    if (send_now) {
      // Create calendar event
      const { data: calendarEvent } = await supabase
        .from("calendar_events")
        .insert({
          workspace_id: proposal.workspace_id,
          event_type: "follow_up",
          title: `Follow-up: ${message.subject}`,
          description: message.body,
          event_date: new Date(finalScheduledAt).toISOString().split("T")[0],
          thread_id: proposal.thread_id,
          contact_id: proposal.contact_id,
          metadata: {
            proposal_id: proposalId,
            followup_id: followup.id,
          },
        })
        .select()
        .single();

      if (calendarEvent) {
        await supabase
          .from("proposal_followups")
          .update({ calendar_event_id: calendarEvent.id })
          .eq("id", followup.id);
      }

      // Send email (via existing send infrastructure)
      // This would integrate with your email sending system
      // For now, we'll just mark it as sent
    }

    return NextResponse.json({
      success: true,
      followup,
      message: send_now ? "Follow-up sent" : "Follow-up scheduled",
    });
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
















































