import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

type OwnerAwaySetting = {
  enabled: boolean;
  session_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  rules?: {
    notify_only_urgent_hot?: boolean;
  };
};

function normalizeSetting(v: any): OwnerAwaySetting {
  const enabled = Boolean(v?.enabled);
  return {
    enabled,
    session_id: typeof v?.session_id === "string" ? v.session_id : null,
    started_at: typeof v?.started_at === "string" ? v.started_at : null,
    ended_at: typeof v?.ended_at === "string" ? v.ended_at : null,
    rules: {
      notify_only_urgent_hot:
        typeof v?.rules?.notify_only_urgent_hot === "boolean"
          ? v.rules.notify_only_urgent_hot
          : true,
    },
  };
}

async function getWorkspaceRole(supabase: ReturnType<typeof createClient>, workspaceId: string, userId: string) {
  const { data } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as any)?.role as string | null;
}

// GET /api/owner/away - Get current Owner Away mode state
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "No active workspace" }, { status: 400 });
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const admin = createServiceClient();
  const { data: row } = await admin
    .from("owner_settings")
    .select("setting_value, updated_at")
    .eq("workspace_id", workspaceId)
    .eq("setting_key", "owner_away")
    .maybeSingle();

  const setting = normalizeSetting((row as any)?.setting_value || {});

  // Resolve latest session for context (best-effort)
  const { data: lastSession } = await admin
    .from("owner_away_sessions")
    .select("id, started_at, ended_at")
    .eq("workspace_id", workspaceId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    workspace_id: workspaceId,
    role,
    setting,
    last_session: lastSession || null,
  });
}

// POST /api/owner/away - Toggle Owner Away mode
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "No active workspace" }, { status: 400 });
  }

  const role = await getWorkspaceRole(supabase, workspaceId, user.id);
  if (!role || !["owner", "admin"].includes(role)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const enabled = Boolean((body as any)?.enabled);
  const notes = typeof (body as any)?.notes === "string" ? (body as any).notes : null;

  const admin = createServiceClient();

  // Read current setting to find active session id (if any)
  const { data: currentRow } = await admin
    .from("owner_settings")
    .select("setting_value")
    .eq("workspace_id", workspaceId)
    .eq("setting_key", "owner_away")
    .maybeSingle();
  const currentSetting = normalizeSetting((currentRow as any)?.setting_value || {});

  const now = new Date().toISOString();

  if (enabled) {
    // Start a new away session
    const { data: session, error: sessionErr } = await supabase
      .from("owner_away_sessions")
      .insert({
        workspace_id: workspaceId,
        enabled_by: user.id,
        started_at: now,
        notes,
        config: { rules: { notify_only_urgent_hot: true } },
      })
      .select("id, started_at, ended_at")
      .single();

    if (sessionErr || !session) {
      return NextResponse.json({ ok: false, error: sessionErr?.message || "Failed to start away session" }, { status: 500 });
    }

    const nextSetting: OwnerAwaySetting = {
      enabled: true,
      session_id: (session as any).id,
      started_at: (session as any).started_at,
      ended_at: null,
      rules: { notify_only_urgent_hot: true },
    };

    const { error: upsertErr } = await supabase
      .from("owner_settings")
      .upsert(
        {
          workspace_id: workspaceId,
          setting_key: "owner_away",
          setting_value: nextSetting as any,
        },
        { onConflict: "workspace_id,setting_key" }
      );

    if (upsertErr) {
      return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      workspace_id: workspaceId,
      setting: nextSetting,
      session,
    });
  }

  // Disable: end current session if exists (fallback: find active session)
  const sessionId =
    currentSetting.session_id ||
    (
      await admin
        .from("owner_away_sessions")
        .select("id")
        .eq("workspace_id", workspaceId)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ).data?.id ||
    null;

  let endedSession: any = null;
  if (sessionId) {
    const { data: s, error: endErr } = await supabase
      .from("owner_away_sessions")
      .update({ ended_at: now, ended_by: user.id })
      .eq("id", sessionId)
      .select("id, started_at, ended_at")
      .single();

    if (endErr) {
      return NextResponse.json({ ok: false, error: endErr.message }, { status: 500 });
    }
    endedSession = s;
  }

  const nextSetting: OwnerAwaySetting = {
    enabled: false,
    session_id: null,
    started_at: currentSetting.started_at,
    ended_at: now,
    rules: { notify_only_urgent_hot: true },
  };

  const { error: upsertErr } = await supabase
    .from("owner_settings")
    .upsert(
      {
        workspace_id: workspaceId,
        setting_key: "owner_away",
        setting_value: nextSetting as any,
      },
      { onConflict: "workspace_id,setting_key" }
    );

  if (upsertErr) {
    return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    workspace_id: workspaceId,
    setting: nextSetting,
    session: endedSession,
  });
}




