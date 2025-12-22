import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_req: NextRequest) {
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

  const [
    { data: limitsRow },
    { data: sendUsageRow },
    { data: replyUsageRow },
    { data: teamMembers },
    { data: events },
  ] = await Promise.all([
    supabase
      .from("workspace_billing_limits")
      .select(
        "daily_send_cap, daily_reply_cap, seat_limit, overage_behavior"
      )
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase
      .from("workspace_send_usage_today")
      .select("sends_count")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase
      .from("workspace_reply_usage_today")
      .select("replies_count")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase
      .from("team_members")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("status", "active"),
    supabase
      .from("billing_usage_events")
      .select("event_type, payload, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const dailySendCap =
    limitsRow?.daily_send_cap && limitsRow.daily_send_cap > 0
      ? limitsRow.daily_send_cap
      : 500;

  const dailyReplyCap =
    limitsRow?.daily_reply_cap && limitsRow.daily_reply_cap > 0
      ? limitsRow.daily_reply_cap
      : null;

  const overageBehavior =
    (limitsRow?.overage_behavior as "hard_stop" | "soft_warn") ||
    "hard_stop";

  const sendsToday = sendUsageRow?.sends_count || 0;
  const repliesToday = replyUsageRow?.replies_count || 0;
  const seatsUsed = teamMembers?.length || 0;
  const seatLimit = limitsRow?.seat_limit || null;

  // send cap status
  let sendCapStatus: "ok" | "near" | "reached" = "ok";
  const ratio = dailySendCap > 0 ? sendsToday / dailySendCap : 0;

  if (ratio >= 1) {
    sendCapStatus = "reached";
  } else if (ratio >= 0.8) {
    sendCapStatus = "near";
  }

  const lastSendCapEvent = (events || []).find(
    (e) => e.event_type === "daily_cap_reached"
  );

  const lastReplyCapEvent = (events || []).find(
    (e) => e.event_type === "reply_cap_reached"
  );

  return Response.json(
    {
      usage: {
        sends_today: sendsToday,
        daily_send_cap: dailySendCap,
        send_cap_status: sendCapStatus,
        overage_behavior: overageBehavior,

        replies_today: repliesToday,
        daily_reply_cap: dailyReplyCap,

        seats_used: seatsUsed,
        seat_limit: seatLimit,
      },
      last_send_cap_event: lastSendCapEvent || null,
      last_reply_cap_event: lastReplyCapEvent || null,
    },
    { status: 200 }
  );
}

