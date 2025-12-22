import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";

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

  // Preferred path: recompute (max-so-far) and return the current values.
  try {
    const { data } = await supabase.rpc("ss_moat_recompute", { p_workspace_id: workspaceId });
    if (data) {
      const d: any = data;
      return NextResponse.json({
        workspace_id: workspaceId,
        as_of: d.as_of ?? null,
        emails_sent_all_time: d.emails_sent ?? 0,
        replies_all_time: d.replies ?? 0,
        hot_all_time: d.hot_all_time ?? 0,
        warm_all_time: d.warm_all_time ?? 0,
        jobs_booked_all_time: d.jobs_booked ?? 0,
        estimated_value_all_time: d.estimated_value ?? 0,
        jobs_closed_all_time: d.jobs_closed ?? 0,
        revenue_closed_all_time: d.revenue_closed ?? 0,
      });
    }
  } catch {
    // fall through to table read
  }

  // Fallback: read the stored proof stack row (never-reset).
  const { data: row, error } = await supabaseAdmin
    .from("ss_moat_proof_stack")
    .select(
      "workspace_id, emails_sent_all_time, replies_all_time, hot_all_time, warm_all_time, jobs_booked_all_time, estimated_value_all_time, jobs_closed_all_time, revenue_closed_all_time, updated_at"
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load proof stack" }, { status: 500 });
  }

  return NextResponse.json({
    workspace_id: workspaceId,
    as_of: (row as any)?.updated_at ?? null,
    emails_sent_all_time: (row as any)?.emails_sent_all_time ?? 0,
    replies_all_time: (row as any)?.replies_all_time ?? 0,
    hot_all_time: (row as any)?.hot_all_time ?? 0,
    warm_all_time: (row as any)?.warm_all_time ?? 0,
    jobs_booked_all_time: (row as any)?.jobs_booked_all_time ?? 0,
    estimated_value_all_time: (row as any)?.estimated_value_all_time ?? 0,
    jobs_closed_all_time: (row as any)?.jobs_closed_all_time ?? 0,
    revenue_closed_all_time: (row as any)?.revenue_closed_all_time ?? 0,
  });
}

