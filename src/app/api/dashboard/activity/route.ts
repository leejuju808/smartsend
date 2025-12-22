import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ActivityType = "send" | "reply" | "meeting" | "task" | "note";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) {
    return Response.json({ error: "not_auth" }, { status: 401 });
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

  const url = new URL(req.url);
  const typeParam = (url.searchParams.get("type") || "all") as
    | ActivityType
    | "all";
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);

  const sinceParam = url.searchParams.get("since");
  const now = new Date();
  const defaultSince = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const since = (sinceParam ? new Date(sinceParam) : defaultSince).toISOString();

  const types: ActivityType[] =
    typeParam === "all"
      ? ["send", "reply", "meeting", "task", "note"]
      : [typeParam];

  const events: any[] = [];

  // 1) Sends
  if (types.includes("send")) {
    // Query send_logs through campaigns to get workspace_id
    const { data, error } = await supabase
      .from("send_logs")
      .select(
        `
        id,
        lead_id,
        campaign_id,
        subject,
        sent_at,
        leads ( email, company ),
        campaigns!inner ( name, workspace_id )
      `
      )
      .eq("campaigns.workspace_id", workspaceId)
      .gte("sent_at", since)
      .order("sent_at", { ascending: false })
      .limit(limit);

    if (!error && data) {
      data.forEach((s) => {
        events.push({
          type: "send",
          at: s.sent_at,
          lead: s.leads,
          campaign: s.campaigns,
          payload: {
            id: s.id,
            subject: s.subject,
          },
        });
      });
    }
  }

  // 2) Replies
  if (types.includes("reply")) {
    const { data, error } = await supabase
      .from("reply_logs")
      .select(
        `
        id,
        lead_id,
        campaign_id,
        subject,
        body,
        received_at,
        created_at,
        ai_category,
        ai_intent,
        ai_has_meeting,
        leads ( email, company ),
        campaigns ( name )
      `
      )
      .eq("workspace_id", workspaceId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!error && data) {
      data.forEach((r) => {
        const timestamp = r.received_at || r.created_at;
        if (timestamp && new Date(timestamp) >= new Date(since)) {
          events.push({
            type: "reply",
            at: timestamp,
            lead: r.leads,
            campaign: r.campaigns,
            payload: {
              id: r.id,
              subject: r.subject,
              ai_category: r.ai_category,
              ai_intent: r.ai_intent,
              ai_has_meeting: r.ai_has_meeting,
            },
          });
        }
      });
    }
  }

  // 3) Meetings
  if (types.includes("meeting")) {
    const { data, error } = await supabase
      .from("lead_meetings")
      .select(
        `
        id,
        lead_id,
        campaign_id,
        title,
        status,
        meeting_url,
        start_time,
        created_at,
        leads ( email, company ),
        campaigns ( name )
      `
      )
      .eq("workspace_id", workspaceId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!error && data) {
      data.forEach((m) => {
        events.push({
          type: "meeting",
          at: m.start_time || m.created_at,
          lead: m.leads,
          campaign: m.campaigns,
          payload: {
            id: m.id,
            title: m.title,
            status: m.status,
            meeting_url: m.meeting_url,
          },
        });
      });
    }
  }

  // 4) Tasks
  if (types.includes("task")) {
    const { data, error } = await supabase
      .from("tasks")
      .select(
        `
        id,
        lead_id,
        campaign_id,
        title,
        notes,
        status,
        due_at,
        created_at,
        leads ( email, company ),
        campaigns ( name )
      `
      )
      .eq("workspace_id", workspaceId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!error && data) {
      data.forEach((t) => {
        events.push({
          type: "task",
          at: t.created_at,
          lead: t.leads,
          campaign: t.campaigns,
          payload: {
            id: t.id,
            title: t.title,
            notes: t.notes,
            status: t.status,
            due_at: t.due_at,
          },
        });
      });
    }
  }

  // 5) Notes
  if (types.includes("note")) {
    const { data, error } = await supabase
      .from("lead_notes")
      .select(
        `
        id,
        lead_id,
        body,
        pinned,
        created_at,
        leads ( email, company )
      `
      )
      .eq("workspace_id", workspaceId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!error && data) {
      data.forEach((n) => {
        events.push({
          type: "note",
          at: n.created_at,
          lead: n.leads,
          campaign: null,
          payload: {
            id: n.id,
            body: n.body,
            pinned: n.pinned,
          },
        });
      });
    }
  }

  // Sort combined events (most recent first) and clamp to limit
  events.sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  );

  const sliced = events.slice(0, limit);

  return Response.json(
    {
      events: sliced,
    },
    { status: 200 }
  );
}

