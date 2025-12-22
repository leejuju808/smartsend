import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's workspace membership
  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  // Fallback to workspace_members if team_members doesn't have a match
  let workspaceId: string | null = null;
  if (membership) {
    workspaceId = membership.workspace_id;
  } else {
    const { data: wsMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    
    if (wsMember) {
      workspaceId = wsMember.workspace_id;
    }
  }

  if (!workspaceId) {
    return Response.json({ error: "no_workspace" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("workspace_usage_summary")
    .select("*")
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !data) {
    return Response.json({ error: "usage_not_found" }, { status: 400 });
  }

  // compute ratios + warning flags
  const {
    daily_send_cap,
    monthly_send_cap,
    seat_limit,
    reply_cap,
    meeting_cap,
    sends_today,
    sends_month,
    replies_month,
    meetings_month,
    seat_count,
  } = data as any;

  const percent = (used: number, cap?: number | null) =>
    !cap || cap <= 0 ? null : Math.round((used / cap) * 100);

  const usage = {
    ...data,
    seats_used_pct: percent(seat_count, seat_limit),
    sends_today_pct: percent(sends_today, daily_send_cap),
    sends_month_pct: percent(sends_month, monthly_send_cap),
    replies_month_pct: percent(replies_month, reply_cap),
    meetings_month_pct: percent(meetings_month, meeting_cap),

    seat_over_limit: seat_limit ? seat_count > seat_limit : false,
    sends_today_over_cap: daily_send_cap ? sends_today > daily_send_cap : false,
    sends_month_over_cap: monthly_send_cap ? sends_month > monthly_send_cap : false,
  };

  return Response.json({ usage }, { status: 200 });
}







