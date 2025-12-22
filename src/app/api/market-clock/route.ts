import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";

function runningDaysFromStartedAt(startedAtIso: string | null) {
  if (!startedAtIso) return 1;
  const t = new Date(startedAtIso).getTime();
  if (!Number.isFinite(t)) return 1;
  const diffMs = Date.now() - t;
  const day = 24 * 60 * 60 * 1000;
  // Always increasing, never 0.
  return Math.max(1, Math.floor(diffMs / day) + 1);
}

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 400 });
  }

  // Verify requester is a member of this workspace.
  const { data: membership, error: memberErr } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberErr) {
    return NextResponse.json({ error: "Membership check failed" }, { status: 500 });
  }
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Preferred path: recompute + return started_at (DB persists min-ever).
  let startedAt: string | null = null;
  try {
    const { data } = await supabase.rpc("ss_moat_recompute", { p_workspace_id: workspaceId });
    startedAt = (data as any)?.started_at ?? null;
  } catch {
    startedAt = null;
  }

  return NextResponse.json(
    {
      workspace_id: workspaceId,
      started_at: startedAt,
      running_days: runningDaysFromStartedAt(startedAt),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}




