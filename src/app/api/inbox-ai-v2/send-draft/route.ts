/**
 * Block 24180 — SmartSend Roofing Inbox AI v2
 * API Endpoint: Send AI Draft
 */

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { draftId } = body;

    if (!draftId) {
      return NextResponse.json(
        { error: "draftId is required" },
        { status: 400 }
      );
    }

    // Get draft
    const { data: draft, error: draftError } = await supabase
      .from("inbox_ai_drafts")
      .select("*, thread_id, campaign_id, lead_id")
      .eq("id", draftId)
      .single();

    if (draftError || !draft) {
      return NextResponse.json(
        { error: "Draft not found" },
        { status: 404 }
      );
    }

    // Get thread to find lead email
    const { data: thread } = await supabase
      .from("inbox_threads")
      .select("*, lead_id")
      .eq("id", draft.thread_id)
      .single();

    if (!thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    // Get lead email
    const { data: lead } = await supabase
      .from("leads")
      .select("email")
      .eq("id", draft.lead_id)
      .single();

    if (!lead?.email) {
      return NextResponse.json(
        { error: "Lead email not found" },
        { status: 404 }
      );
    }

    // TODO: Send email via your email sending service
    // For now, create an outbound message record
    const { data: sentMessage, error: sendError } = await supabase
      .from("inbox_messages")
      .insert({
        thread_id: draft.thread_id,
        campaign_id: draft.campaign_id,
        lead_id: draft.lead_id,
        direction: "out",
        sender_email: user.email || "noreply@smartsend.ai",
        receiver_email: lead.email,
        subject: draft.draft_subject,
        body: draft.draft_body,
        sent_at: new Date().toISOString()
      })
      .select()
      .single();

    if (sendError) {
      return NextResponse.json(
        { error: "Failed to send message" },
        { status: 500 }
      );
    }

    // Update draft status
    await supabase
      .from("inbox_ai_drafts")
      .update({
        status: "sent",
        approved_by: user.id,
        approved_at: new Date().toISOString()
      })
      .eq("id", draftId);

    // Update speed lead if exists
    const { data: speedLead } = await supabase
      .from("inbox_speed_leads")
      .select("id")
      .eq("thread_id", draft.thread_id)
      .eq("status", "draft_ready")
      .single();

    if (speedLead) {
      const responseTime = Date.now() - new Date(speedLead.detected_at || Date.now()).getTime();
      await supabase
        .from("inbox_speed_leads")
        .update({
          sent_at: new Date().toISOString(),
          response_time_ms: responseTime,
          status: "sent"
        })
        .eq("id", speedLead.id);
    }

    return NextResponse.json({
      success: true,
      messageId: sentMessage?.id,
      draftId
    });

  } catch (error) {
    console.error("Error sending draft:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to send draft" },
      { status: 500 }
    );
  }
}






































