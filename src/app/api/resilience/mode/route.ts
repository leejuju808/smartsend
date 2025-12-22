import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveWorkspaceId } from "@/lib/workspace/context";
import { normalizeResilienceMode, throttleForResilienceMode, type ResilienceMode } from "@/lib/resilience/mode";
import { blockIfAutopilotEnabled } from "@/lib/autopilot/guard";
import { requireDecisionForAction } from "@/lib/decisions/guard";

async function ensureMember(supabase: ReturnType<typeof createRouteHandlerClient>, workspaceId: string, userId: string) {
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

    const { data: ws, error: wsErr } = await supabaseAdmin
      .from("workspaces")
      .select("id, resilience_mode, resilience_mode_set_at, demand_throttle")
      .eq("id", workspaceId)
      .maybeSingle();

    if (wsErr) return NextResponse.json({ error: wsErr.message }, { status: 500 });

    const mode = normalizeResilienceMode((ws as any)?.resilience_mode);

    return NextResponse.json(
      {
        ok: true,
        workspace_id: workspaceId,
        resilience: {
          mode,
          mode_set_at: (ws as any)?.resilience_mode_set_at || null,
          demand_throttle_effective: throttleForResilienceMode(mode),
          demand_throttle_current: String((ws as any)?.demand_throttle || "normal"),
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

    const autopilotGate = await blockIfAutopilotEnabled({
      req,
      workspaceId,
      action: "Storm/Surge mode",
    });
    if (autopilotGate.blocked) return autopilotGate.response;

    const body = await req.json().catch(() => ({}));
    const decisionGate = await requireDecisionForAction({
      req,
      supabase,
      workspaceId,
      userId: user.id,
      decisionId: (body as any)?.decision_id,
      decisionTypes: ["resilience_mode"],
      requireChoice: "act",
    });
    if (decisionGate.blocked) return decisionGate.response;

    const mode = normalizeResilienceMode((body as any)?.mode);
    const nowIso = new Date().toISOString();

    // For no-thinking safety, we also align demand_throttle to the mode.
    const demandThrottle = throttleForResilienceMode(mode);

    const { data: ws, error: wsErr } = await supabaseAdmin
      .from("workspaces")
      .update({
        resilience_mode: mode,
        resilience_mode_set_at: nowIso,
        demand_throttle: demandThrottle,
      })
      .eq("id", workspaceId)
      .select("id, resilience_mode, resilience_mode_set_at, demand_throttle")
      .maybeSingle();

    if (wsErr) return NextResponse.json({ error: wsErr.message }, { status: 500 });

    return NextResponse.json(
      {
        ok: true,
        workspace_id: workspaceId,
        resilience: {
          mode: normalizeResilienceMode((ws as any)?.resilience_mode),
          mode_set_at: (ws as any)?.resilience_mode_set_at || null,
          demand_throttle_effective: throttleForResilienceMode(normalizeResilienceMode((ws as any)?.resilience_mode)),
          demand_throttle_current: String((ws as any)?.demand_throttle || "normal"),
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}



