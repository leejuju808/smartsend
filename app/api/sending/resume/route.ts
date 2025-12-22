import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export async function POST(_req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "no_workspace" }, { status: 404 });
  }

  // One-tap recovery uses service role to avoid RLS edge cases.
  const admin = createServiceClient();

  // 1) Resume paused campaigns (reputation guard)
  const { data: pausedCampaigns, error: pausedErr } = await admin
    .from("campaigns")
    .select("id")
    .eq("workspace_id", workspaceId)
    .or("paused.eq.true,status.eq.paused")
    .limit(500);

  if (pausedErr) {
    return NextResponse.json({ error: "campaigns_read_failed", details: pausedErr.message }, { status: 500 });
  }

  const ids = (pausedCampaigns || []).map((c: any) => String(c.id));

  let resumedCampaigns = 0;
  if (ids.length > 0) {
    // Best-effort: clear pause flags if present, and set status running.
    const { error: updErr } = await admin
      .from("campaigns")
      .update({
        status: "running",
        paused: false,
        pause_reason: null,
        paused_at: null,
      })
      .in("id", ids);

    if (updErr) {
      return NextResponse.json({ error: "campaigns_resume_failed", details: updErr.message }, { status: 500 });
    }
    resumedCampaigns = ids.length;
  }

  // 2) Best-effort: clear workspace-level pause if schema supports it
  // (Some environments use workspaces.sending_paused from safety systems.)
  try {
    await admin.from("workspaces").update({ sending_paused: false }).eq("id", workspaceId);
  } catch {
    // ignore drift
  }

  // 3) Best-effort: unlock locked send_queue items (if column exists)
  try {
    await admin
      .from("send_queue")
      .update({ locked: false })
      .eq("workspace_id", workspaceId)
      .eq("locked", true);
  } catch {
    // ignore drift
  }

  return NextResponse.json({
    ok: true,
    resumed_campaigns: resumedCampaigns,
  });
}








