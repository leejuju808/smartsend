import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

function startOfDayIsoUtc(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  return x.toISOString();
}

function dayKeyUtc(iso: string) {
  return String(iso).slice(0, 10);
}

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 400 });
  }

  const { data: isMember } = await supabase.rpc("is_workspace_member", {
    p_ws: workspaceId,
    p_uid: user.id,
  });
  if (!isMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createServiceClient();

  const { data: campaigns } = await admin
    .from("campaigns")
    .select("id")
    .eq("workspace_id", workspaceId)
    .limit(5000);

  const campaignIds = (campaigns ?? []).map((c: any) => c.id).filter(Boolean);

  const now = new Date();
  const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const startIso = startOfDayIsoUtc(start);
  const endIso = new Date().toISOString();

  const sendsByDay = new Map<string, number>();
  const repliesByDay = new Map<string, number>();
  const jobsByDay = new Map<string, number>();

  if (campaignIds.length > 0) {
    const { data: sends } = await admin
      .from("send_logs")
      .select("sent_at,status")
      .in("campaign_id", campaignIds)
      .in("status", ["sent", "delivered"])
      .gte("sent_at", startIso)
      .lte("sent_at", endIso)
      .limit(100000);

    for (const row of sends ?? []) {
      const k = row?.sent_at ? dayKeyUtc(row.sent_at) : null;
      if (!k) continue;
      sendsByDay.set(k, (sendsByDay.get(k) || 0) + 1);
    }

    const { data: replies } = await admin
      .from("smartsend_reply_events")
      .select("created_at")
      .in("campaign_id", campaignIds)
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .limit(100000);

    for (const row of replies ?? []) {
      const k = row?.created_at ? dayKeyUtc(row.created_at) : null;
      if (!k) continue;
      repliesByDay.set(k, (repliesByDay.get(k) || 0) + 1);
    }
  }

  // Jobs booked (appointments) scoped to workspace.
  try {
    const { data: appts } = await admin
      .from("appointments")
      .select("created_at,status")
      .eq("workspace_id", workspaceId)
      .neq("status", "cancelled")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .limit(100000);

    for (const row of appts ?? []) {
      const k = row?.created_at ? dayKeyUtc(row.created_at) : null;
      if (!k) continue;
      jobsByDay.set(k, (jobsByDay.get(k) || 0) + 1);
    }
  } catch {
    // appointments table may not exist in all DBs
  }

  // Walk the last 30 calendar days (UTC) and aggregate into active vs inactive.
  let activeDays = 0;
  let inactiveDays = 0;
  let activeReplies = 0;
  let inactiveReplies = 0;
  let activeJobs = 0;
  let inactiveJobs = 0;

  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = dayKeyUtc(startOfDayIsoUtc(d));

    const sends = sendsByDay.get(key) || 0;
    const replies = repliesByDay.get(key) || 0;
    const jobs = jobsByDay.get(key) || 0;

    if (sends > 0) {
      activeDays++;
      activeReplies += replies;
      activeJobs += jobs;
    } else {
      inactiveDays++;
      inactiveReplies += replies;
      inactiveJobs += jobs;
    }
  }

  return NextResponse.json({
    ok: true,
    workspace_id: workspaceId,
    as_of: new Date().toISOString(),
    window_days: 30,
    active: {
      days: activeDays,
      replies: activeReplies,
      jobs_booked: activeJobs,
    },
    inactive: {
      days: inactiveDays,
      replies: inactiveReplies,
      jobs_booked: inactiveJobs,
    },
  });
}




