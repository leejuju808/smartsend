import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) {
    return Response.json({ error: "not_auth" }, { status: 401 });
  }

  const url = new URL(req.url);
  const leadId = url.searchParams.get("leadId");
  const campaignId = url.searchParams.get("campaignId");

  if (!leadId || !campaignId) {
    return Response.json(
      { error: "lead_and_campaign_required" },
      { status: 400 }
    );
  }

  // workspace via team_members
  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .single();

  if (memErr || !membership) {
    return Response.json({ error: "no_workspace" }, { status: 400 });
  }

  const workspaceId = membership.workspace_id;

  // Lead + campaign meta + thread state + campaign lead state + meeting
  const [{ data: lead }, { data: campaign }, { data: state }, { data: cls }, { data: meeting }] = await Promise.all([
    supabase
      .from("leads")
      .select("id, email, first_name, last_name, company")
      .eq("id", leadId)
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase
      .from("campaigns")
      .select("id, name")
      .eq("id", campaignId)
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase
      .from("reply_thread_state")
      .select("status")
      .eq("workspace_id", workspaceId)
      .eq("lead_id", leadId)
      .eq("campaign_id", campaignId)
      .maybeSingle(),
    supabase
      .from("campaign_lead_state")
      .select("stop_followups, stopped_at")
      .eq("workspace_id", workspaceId)
      .eq("campaign_id", campaignId)
      .eq("lead_id", leadId)
      .maybeSingle(),
    supabase
      .from("reply_thread_meeting")
      .select("status, meeting_at, notes")
      .eq("workspace_id", workspaceId)
      .eq("lead_id", leadId)
      .eq("campaign_id", campaignId)
      .maybeSingle(),
  ]);

  // Outbound sends - join through campaigns to get workspace_id
  const { data: sends, error: sendErr } = await supabase
    .from("send_logs")
    .select(
      `
      id,
      campaign_id,
      lead_id,
      subject,
      body,
      body_preview,
      sent_at,
      account_id,
      connected_accounts(email)
    `
    )
    .eq("lead_id", leadId)
    .eq("campaign_id", campaignId)
    .order("sent_at", { ascending: true });

  if (sendErr) {
    console.error("thread sends error", sendErr);
  }

  // Inbound replies
  const { data: replies, error: replyErr } = await supabase
    .from("reply_logs")
    .select(
      `
      id,
      campaign_id,
      lead_id,
      subject,
      body,
      received_at,
      ai_category,
      ai_intent,
      ai_has_meeting,
      ai_stop_followups
    `
    )
    .eq("workspace_id", workspaceId)
    .eq("lead_id", leadId)
    .eq("campaign_id", campaignId)
    .order("received_at", { ascending: true });

  if (replyErr) {
    console.error("thread replies error", replyErr);
  }

  type Event =
    | {
        id: string;
        kind: "outbound";
        at: string;
        subject: string | null;
        body: string | null;
        sender_email: string | null;
      }
    | {
        id: string;
        kind: "inbound";
        at: string;
        subject: string | null;
        body: string | null;
        ai_category: string | null;
        ai_intent: string | null;
        ai_has_meeting: boolean;
        ai_stop_followups: boolean;
      };

  const events: Event[] = [];

  (sends || []).forEach((s: any) => {
    events.push({
      id: s.id,
      kind: "outbound",
      at: s.sent_at,
      subject: s.subject,
      body: s.body || s.body_preview || null,
      sender_email: s.connected_accounts?.email || null,
    });
  });

  (replies || []).forEach((r: any) => {
    events.push({
      id: r.id,
      kind: "inbound",
      at: r.received_at || r.created_at,
      subject: r.subject,
      body: r.body,
      ai_category: r.ai_category,
      ai_intent: r.ai_intent,
      ai_has_meeting: !!r.ai_has_meeting,
      ai_stop_followups: !!r.ai_stop_followups,
    });
  });

  events.sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  );

  const thread_status = (state?.status as "open" | "handled") || "open";
  const stop_followups = !!cls?.stop_followups;
  const stopped_at = cls?.stopped_at || null;

  const meetingBlock = meeting
    ? {
        status: meeting.status as
          | "pending"
          | "booked"
          | "completed"
          | "no_show"
          | "canceled",
        meeting_at: meeting.meeting_at,
        notes: meeting.notes,
      }
    : null;

  return Response.json(
    {
      lead,
      campaign,
      events,
      thread_status,
      followups: {
        stop_followups,
        stopped_at,
      },
      meeting: meetingBlock,
    },
    { status: 200 }
  );
}
