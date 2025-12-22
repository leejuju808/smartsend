import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
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

  // Validate workspace membership (do not trust cookie-derived workspace id).
  const { data: isMember } = await supabase.rpc("is_workspace_member", {
    p_ws: workspaceId,
    p_uid: user.id,
  });
  if (!isMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createServiceClient();

  // Campaigns in this workspace (used to scope sends)
  const { data: campaigns } = await admin
    .from("campaigns")
    .select("id")
    .eq("workspace_id", workspaceId)
    .limit(5000);

  const campaignIds = (campaigns ?? []).map((c: any) => c.id).filter(Boolean);

  const todayStart = startOfTodayIso();

  // Sends today
  let sendsToday = 0;
  if (campaignIds.length > 0) {
    const { count } = await admin
      .from("send_logs")
      .select("id", { count: "exact", head: true })
      .in("campaign_id", campaignIds)
      .in("status", ["sent", "delivered"])
      .gte("sent_at", todayStart);
    sendsToday = count ?? 0;
  }

  // Hot homeowners waiting (unreplied hot inbound)
  const { count: hotHomeownersWaiting } = await admin
    .from("inbox_messages")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("direction", "inbound")
    .eq("intent", "hot_lead")
    .eq("replied", false);

  // Safe minimum daily sends (simple + factual, based on current throttle / deliverability).
  let safeMinDailySends = 10;
  try {
    const { data: dash } = await admin
      .from("v_scheduler_dashboard")
      .select("throttle_status, deliverability_score")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    const throttle = String((dash as any)?.throttle_status || "normal");
    const score = Number((dash as any)?.deliverability_score ?? 100);

    if (["repair_mode", "paused"].includes(throttle)) {
      safeMinDailySends = 0;
    } else if (Number.isFinite(score) && score < 60) {
      safeMinDailySends = 5;
    }
  } catch {
    // default
  }

  const remainingToMinimum = Math.max(0, safeMinDailySends - sendsToday);

  return NextResponse.json({
    ok: true,
    workspace_id: workspaceId,
    as_of: new Date().toISOString(),
    minimum_daily_sends: safeMinDailySends,
    sends_today: sendsToday,
    remaining_to_minimum: remainingToMinimum,
    hot_homeowners_waiting: hotHomeownersWaiting ?? 0,
    followups_mandatory: true,
  });
}




