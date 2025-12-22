import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

type ChannelType = "ads" | "lead_service" | "agency";
type ActionType = "start" | "stop";

function asChannel(v: unknown): ChannelType | null {
  const s = String(v || "").trim();
  if (s === "ads" || s === "lead_service" || s === "agency") return s;
  return null;
}

function asAction(v: unknown): ActionType | null {
  const s = String(v || "").trim();
  if (s === "start" || s === "stop") return s;
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No active workspace" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const channel_type = asChannel(body?.channel_type ?? body?.channel);
    const action = asAction(body?.action);

    if (!channel_type || !action) {
      return NextResponse.json(
        { error: "Invalid payload. Expected { channel_type, action }" },
        { status: 400 }
      );
    }

    // Stop any currently running test (and re-enable paused sources) before starting a new one.
    const { data: activeTest } = await supabase
      .from("channel_pause_tests")
      .select("id, paused_lead_source_ids, channel_type")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    async function stopTest(test: any) {
      const pausedIds: string[] = Array.isArray(test?.paused_lead_source_ids)
        ? test.paused_lead_source_ids
        : [];

      if (pausedIds.length > 0) {
        await supabase
          .from("roofing_lead_sources")
          .update({ is_active: true })
          .in("id", pausedIds)
          .eq("workspace_id", workspaceId);
      }

      await supabase
        .from("channel_pause_tests")
        .update({ is_active: false, ended_at: new Date().toISOString() })
        .eq("id", test.id)
        .eq("workspace_id", workspaceId);
    }

    if (action === "stop") {
      if (activeTest?.id) {
        await stopTest(activeTest);
      }
      return NextResponse.json({ ok: true });
    }

    // action === "start"
    if (activeTest?.id) {
      await stopTest(activeTest);
    }

    // Pause all currently-active lead sources for that channel (blunt switch-off)
    const channelTypesToPause: ChannelType[] =
      channel_type === "ads" ? ["ads", "lead_service"] : [channel_type];

    const { data: sources, error: sourcesErr } = await supabase
      .from("roofing_lead_sources")
      .select("id")
      .eq("workspace_id", workspaceId)
      .in("channel_type", channelTypesToPause)
      .eq("is_active", true);

    if (sourcesErr) {
      return NextResponse.json(
        { error: "Failed to load lead sources to pause", details: sourcesErr.message },
        { status: 500 }
      );
    }

    const idsToPause = (sources ?? []).map((s: any) => s.id).filter(Boolean);

    if (idsToPause.length > 0) {
      const { error: pauseErr } = await supabase
        .from("roofing_lead_sources")
        .update({ is_active: false })
        .in("id", idsToPause)
        .eq("workspace_id", workspaceId);

      if (pauseErr) {
        return NextResponse.json(
          { error: "Failed to pause lead sources", details: pauseErr.message },
          { status: 500 }
        );
      }
    }

    const { error: insertErr } = await supabase.from("channel_pause_tests").insert({
      workspace_id: workspaceId,
      channel_type,
      paused_lead_source_ids: idsToPause,
      is_active: true,
    });

    if (insertErr) {
      return NextResponse.json(
        { error: "Failed to start continuity test", details: insertErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("replacement-thresholds pause-test error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}




