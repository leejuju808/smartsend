import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveWorkspaceId } from "@/lib/workspace/context";
import { blockIfAutopilotEnabled } from "@/lib/autopilot/guard";
import { requireDecisionForAction } from "@/lib/decisions/guard";

function normalizeZip(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  // Keep it simple: allow 5-digit ZIPs; ignore anything else for v1.
  const digits = s.replace(/[^\d]/g, "");
  if (digits.length !== 5) return null;
  return digits;
}

async function getRole(supabase: ReturnType<typeof createRouteHandlerClient>, workspaceId: string, userId: string) {
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

    await getRole(supabase, workspaceId, user.id);

    // Use RLS-scoped client for reads.
    const { data: rows, error } = await supabase
      .from("workspace_spillover_zips")
      .select("zip, is_active, updated_at")
      .eq("workspace_id", workspaceId)
      .order("is_active", { ascending: false })
      .order("zip", { ascending: true })
      .limit(500);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(
      { ok: true, workspace_id: workspaceId, rows: rows || [] },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

    const role = await getRole(supabase, workspaceId, user.id);
    if (role !== "owner" && role !== "admin") {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const autopilotGate = await blockIfAutopilotEnabled({
      req,
      workspaceId,
      action: "Spillover zips (area routing)",
    });
    if (autopilotGate.blocked) return autopilotGate.response;

    const body = await req.json().catch(() => ({}));
    const decisionGate = await requireDecisionForAction({
      req,
      supabase,
      workspaceId,
      userId: user.id,
      decisionId: (body as any)?.decision_id,
      decisionTypes: ["spillover_zips"],
      requireChoice: "act",
    });
    if (decisionGate.blocked) return decisionGate.response;

    const zip = normalizeZip((body as any).zip);
    const isActive = Boolean((body as any).is_active);
    if (!zip) return NextResponse.json({ error: "zip must be a 5-digit ZIP code" }, { status: 400 });

    const { error: upsertErr } = await supabaseAdmin.from("workspace_spillover_zips").upsert(
      {
        workspace_id: workspaceId,
        zip,
        is_active: isActive,
      },
      { onConflict: "workspace_id,zip", ignoreDuplicates: false }
    );

    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}





