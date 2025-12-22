import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

async function ensureOwnerAdmin(
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
  const role = String((membership as any).role || "");
  if (role !== "owner" && role !== "admin") throw new Error("Insufficient permissions");
  return role;
}

function safeJson(v: unknown) {
  if (v === null || v === undefined) return {};
  if (typeof v === "object") return v as any;
  return { value: v };
}

function normalizeChoice(v: unknown): "act" | "accept" | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "act") return "act";
  if (s === "accept") return "accept";
  return null;
}

const ALLOWED_TYPES = new Set([
  "capacity_settings",
  "spillover_zips",
  "os_levers",
  "autopilot_toggle",
  "resilience_mode",
  "growth_ceiling",
  "other",
]);

export async function GET(_req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

    // RLS scopes this to the workspace member.
    const { data, error } = await supabase
      .from("ss_decisions")
      .select("id, created_at, created_by, decision_type, choice, action_label, proposed_changes")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, workspace_id: workspaceId, decisions: data || [] }, { headers: { "Cache-Control": "no-store" } });
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

    await ensureOwnerAdmin(supabase, workspaceId, user.id);

    const body = await req.json().catch(() => ({}));
    const decisionType = String((body as any)?.decision_type || "").trim();
    const choice = normalizeChoice((body as any)?.choice);
    const actionLabel = String((body as any)?.action_label || "").trim();
    const proposedChanges = safeJson((body as any)?.proposed_changes);
    const context = safeJson((body as any)?.context);
    const validForSecondsRaw = (body as any)?.valid_for_seconds;
    const validForSeconds =
      typeof validForSecondsRaw === "number" && Number.isFinite(validForSecondsRaw)
        ? Math.max(60, Math.min(60 * 60, Math.floor(validForSecondsRaw)))
        : 15 * 60;

    if (!ALLOWED_TYPES.has(decisionType)) {
      return NextResponse.json(
        { error: "Invalid decision_type", allowed: Array.from(ALLOWED_TYPES) },
        { status: 400 }
      );
    }
    if (!choice) {
      return NextResponse.json({ error: 'choice must be "act" or "accept"' }, { status: 400 });
    }

    const now = new Date();
    const validUntil = new Date(now.getTime() + validForSeconds * 1000).toISOString();

    const { data, error } = await supabase
      .from("ss_decisions")
      .insert({
        workspace_id: workspaceId,
        created_by: user.id,
        decision_type: decisionType,
        choice,
        action_label: actionLabel,
        proposed_changes: proposedChanges,
        context,
        valid_until: validUntil,
      } as any)
      .select("id, created_at, decision_type, choice, valid_until")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, workspace_id: workspaceId, decision: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) {
    const msg = String(e?.message || "Internal error");
    const status = msg === "Insufficient permissions" ? 403 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}



