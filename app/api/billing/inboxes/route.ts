import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

type InboxRow = {
  id: string;
  email: string | null;
  provider: string | null;
  status: string | null;
  daily_cap_override: number | null;
};

export async function GET(_req: NextRequest) {
  const supabase = createClient();

  // Auth
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) {
    return Response.json({ error: "not_auth" }, { status: 401 });
  }

  // Workspace
  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .single();

  let workspaceId: string | null = null;

  if (memErr || !membership) {
    // Fallback to workspace_members
    const { data: wsMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!wsMember) {
      return Response.json({ error: "no_workspace" }, { status: 400 });
    }

    workspaceId = wsMember.workspace_id;
  } else {
    workspaceId = membership.workspace_id;
  }

  if (!workspaceId) {
    return Response.json({ error: "no_workspace" }, { status: 400 });
  }

  // Fetch all email accounts for this workspace
  const { data: inboxRows, error: inboxErr } = await supabase
    .from("email_accounts")
    .select("id, email, provider, status, daily_cap_override")
    .eq("workspace_id", workspaceId);

  if (inboxErr) {
    console.error("[billing.inboxes] email_accounts error", inboxErr);
    return Response.json({ error: "inbox_query_failed" }, { status: 400 });
  }

  const inboxes = (inboxRows || []) as InboxRow[];

  if (inboxes.length === 0) {
    return Response.json(
      {
        workspace_id: workspaceId,
        inboxes: [],
      },
      { status: 200 }
    );
  }

  // Time windows
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).toISOString();

  const thirtyDaysAgo = new Date(
    now.getTime() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const inboxIds = inboxes.map((i) => i.id);

  // Fetch sends for these inboxes in last 30 days (we'll split into today vs 30d in code)
  const { data: sendRows, error: sendErr } = await supabase
    .from("send_logs")
    .select("id, account_id, sent_at, status")
    .eq("workspace_id", workspaceId)
    .eq("status", "sent")
    .in("account_id", inboxIds)
    .gte("sent_at", thirtyDaysAgo);

  if (sendErr) {
    console.error("[billing.inboxes] send_logs error", sendErr);
    return Response.json({ error: "send_query_failed" }, { status: 400 });
  }

  const sends = (sendRows || []) as {
    id: string;
    account_id: string | null;
    sent_at: string;
    status: string | null;
  }[];

  type InboxUsage = {
    inbox_id: string;
    email: string | null;
    provider: string | null;
    status: string | null;
    daily_send_cap: number;
    sends_today: number;
    sends_30d: number;
    daily_send_pct: number;
  };

  const DEFAULT_DAILY_CAP = 200; // fallback if daily_cap_override is null

  const usageMap = new Map<string, InboxUsage>();

  const ensureUsage = (inbox: InboxRow): InboxUsage => {
    const existing = usageMap.get(inbox.id);
    if (existing) return existing;

    const cap = inbox.daily_cap_override ?? DEFAULT_DAILY_CAP;

    const created: InboxUsage = {
      inbox_id: inbox.id,
      email: inbox.email,
      provider: inbox.provider,
      status: inbox.status,
      daily_send_cap: cap,
      sends_today: 0,
      sends_30d: 0,
      daily_send_pct: 0,
    };
    usageMap.set(inbox.id, created);
    return created;
  };

  for (const inbox of inboxes) {
    ensureUsage(inbox);
  }

  for (const s of sends) {
    if (!s.account_id) continue;
    const inbox = inboxes.find((i) => i.id === s.account_id);
    if (!inbox) continue;

    const u = ensureUsage(inbox);
    u.sends_30d += 1;

    if (s.sent_at >= todayStart) {
      u.sends_today += 1;
    }
  }

  // compute pct
  for (const u of usageMap.values()) {
    if (u.daily_send_cap > 0) {
      u.daily_send_pct = Math.min(
        100,
        Math.round((u.sends_today / u.daily_send_cap) * 100)
      );
    } else {
      u.daily_send_pct = 0;
    }
  }

  return Response.json(
    {
      workspace_id: workspaceId,
      inboxes: Array.from(usageMap.values()),
      generated_at: now.toISOString(),
    },
    { status: 200 }
  );
}





