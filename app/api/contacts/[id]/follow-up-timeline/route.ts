// Block 21714 — SmartSend Roofing Contact Follow-Up Timeline API
// GET /api/contacts/[id]/follow-up-timeline
// Returns chronological list of events for a single contact, grouped under their current campaign follow-up profile

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspace
  const { data: userProfile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();

  const workspaceId = userProfile?.workspace_id;
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  const { id: contactId } = await params;

  try {
    // 1) Get contact + verify workspace access
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("id, workspace_id, first_name, email, city")
      .eq("id", contactId)
      .eq("workspace_id", workspaceId)
      .single();

    if (contactError || !contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // 2) Get most recent follow_up_profile for this contact
    const { data: followUpProfile, error: profileError } = await supabase
      .from("follow_up_profiles")
      .select(
        `
        id,
        company_id,
        campaign_id,
        current_stage,
        status,
        lead_intent,
        last_outbound_at,
        last_inbound_at,
        created_at
      `
      )
      .eq("contact_id", contact.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (profileError) {
      console.error("Error fetching follow_up_profile:", profileError);
    }

    if (!followUpProfile) {
      return NextResponse.json({
        data: {
          contact,
          profile: null,
          events: [],
        },
      });
    }

    // 3) Load follow_up_logs, outbound queue, inbound emails for this profile
    const [logsRes, outboundRes, inboundRes] = await Promise.all([
      supabase
        .from("follow_up_logs")
        .select(
          `
          id,
          action,
          notes,
          from_stage,
          to_stage,
          created_at
        `
        )
        .eq("follow_up_profile_id", followUpProfile.id),
      supabase
        .from("email_send_queue")
        .select(
          `
          id,
          follow_up_stage,
          subject,
          status,
          created_at,
          sent_at
        `
        )
        .eq("follow_up_profile_id", followUpProfile.id),
      supabase
        .from("inbound_emails")
        .select(
          `
          id,
          subject,
          text_body,
          received_at
        `
        )
        .eq("contact_id", contact.id)
        .eq("campaign_id", followUpProfile.campaign_id),
    ]);

    const logs = logsRes.data ?? [];
    const outbound = outboundRes.data ?? [];
    const inbound = inboundRes.data ?? [];

    // 4) Normalize into a single event list
    type TimelineEvent = {
      id: string;
      type:
        | "initial_sent"
        | "follow_up_sent"
        | "inbound_reply"
        | "auto_reply_hot"
        | "auto_reply_warm"
        | "status_change";
      label: string;
      description?: string;
      stage?: string | null;
      timestamp: string;
    };

    const events: TimelineEvent[] = [];

    // Outbound emails → initial or follow-up
    for (const e of outbound) {
      const isFollowUp = !!e.follow_up_stage;
      const ts = e.sent_at || e.created_at;

      events.push({
        id: `out-${e.id}`,
        type: isFollowUp ? "follow_up_sent" : "initial_sent",
        label: isFollowUp ? "Follow-up sent" : "Initial email sent",
        description: e.subject || undefined,
        stage: e.follow_up_stage,
        timestamp: ts,
      });
    }

    // Inbound replies
    for (const r of inbound) {
      events.push({
        id: `in-${r.id}`,
        type: "inbound_reply",
        label: "Homeowner replied",
        description: r.subject || (r.text_body || "").slice(0, 140),
        timestamp: r.received_at,
      });
    }

    // Logs (status + auto-replies)
    for (const l of logs) {
      let type: TimelineEvent["type"] | null = null;
      let label = "";
      if (l.action === "auto_reply_hot") {
        type = "auto_reply_hot";
        label = "Auto-reply sent to hot lead";
      } else if (l.action === "auto_reply_warm") {
        type = "auto_reply_warm";
        label = "Auto-reply sent to warm lead";
      } else if (l.action === "marked_cold" || l.action === "stopped_by_reply") {
        type = "status_change";
        label =
          l.action === "marked_cold"
            ? "Marked as cold"
            : "Follow-ups stopped after reply";
      } else {
        // generic status change
        type = "status_change";
        label = l.action.replace(/_/g, " ");
      }

      if (type) {
        events.push({
          id: `log-${l.id}`,
          type,
          label,
          description: l.notes || undefined,
          stage: l.to_stage,
          timestamp: l.created_at,
        });
      }
    }

    // Sort by timestamp ASC
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return NextResponse.json({
      data: {
        contact,
        profile: followUpProfile,
        events,
      },
    });
  } catch (err: any) {
    console.error("[Follow-Up Timeline] Unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected error loading contact timeline" },
      { status: 500 }
    );
  }
}

