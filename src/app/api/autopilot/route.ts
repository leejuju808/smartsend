import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveWorkspaceId } from "@/lib/workspace/context";
import { getAutopilotSnapshot } from "@/lib/autopilot/guard";
import { requireDecisionForAction } from "@/lib/decisions/guard";

async function ensureMember(
  supabase: ReturnType<typeof createRouteHandlerClient>,
  workspaceId: string,
  userId: string
) {
  const { data: membership, error } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Membership check failed");
  if (!membership) throw new Error("Forbidden");
  return String((membership as any).role || "");
}

function daysBetween(startIso: string, endIso: string): number {
  const a = new Date(startIso).getTime();
  const b = new Date(endIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.floor((b - a) / (24 * 60 * 60 * 1000)));
}

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

    await ensureMember(supabase, workspaceId, user.id);

    const snapshot = await getAutopilotSnapshot(workspaceId);
    const nowIso = new Date().toISOString();
    const daysIn = snapshot.enabled && snapshot.enabled_at ? daysBetween(snapshot.enabled_at, nowIso) : 0;
    const daysUntilLock =
      snapshot.enabled && snapshot.enabled_at ? Math.max(0, snapshot.lock_days - daysIn) : null;

    return NextResponse.json(
      {
        ok: true,
        workspace_id: workspaceId,
        as_of: nowIso,
        autopilot: {
          enabled: snapshot.enabled,
          enabled_at: snapshot.enabled_at,
          locked: snapshot.locked,
          locked_at: snapshot.locked_at,
          lock_days: snapshot.lock_days,
          days_in_autopilot: daysIn,
          days_until_lock: daysUntilLock,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

    const role = await ensureMember(supabase, workspaceId, user.id);
    if (role !== "owner" && role !== "admin") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const decisionGate = await requireDecisionForAction({
      req,
      supabase,
      workspaceId,
      userId: user.id,
      decisionId: (body as any)?.decision_id,
      decisionTypes: ["autopilot_toggle"],
      requireChoice: "act",
    });
    if (decisionGate.blocked) return decisionGate.response;

    const enabled = Boolean((body as any)?.enabled);

    const current = await getAutopilotSnapshot(workspaceId);
    if (!enabled && current.locked) {
      return NextResponse.json(
        { error: "AUTOPILOT is locked and cannot be disabled.", autopilot: current },
        { status: 423 }
      );
    }

    const nowIso = new Date().toISOString();

    if (enabled) {
      await supabaseAdmin
        .from("workspaces")
        .update({
          autopilot_enabled: true,
          autopilot_enabled_at: current.enabled_at || nowIso,
        } as any)
        .eq("id", workspaceId);

      // Best-effort event log (may not exist on older DBs)
      try {
        await supabaseAdmin.from("autopilot_events").insert({
          workspace_id: workspaceId,
          occurred_at: nowIso,
          actor_user_id: user.id,
          event_type: "enabled",
          meta: {},
        } as any);
      } catch {}
    } else {
      await supabaseAdmin
        .from("workspaces")
        .update({
          autopilot_enabled: false,
          autopilot_enabled_at: null,
          autopilot_locked: false,
          autopilot_locked_at: null,
        } as any)
        .eq("id", workspaceId);

      try {
        await supabaseAdmin.from("autopilot_events").insert({
          workspace_id: workspaceId,
          occurred_at: nowIso,
          actor_user_id: user.id,
          event_type: "disabled",
          meta: {},
        } as any);
      } catch {}
    }

    return await GET();
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
