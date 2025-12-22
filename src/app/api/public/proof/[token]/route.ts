export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(_: NextRequest, { params }: { params: { token: string } }) {
  const token = String(params.token || "").trim();
  if (!token || token.length < 8) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: share, error: shareErr } = await supabaseAdmin
    .from("workspace_proof_shares")
    .select("workspace_id, revoked_at")
    .eq("token", token)
    .limit(1)
    .maybeSingle();

  if (shareErr) return NextResponse.json({ error: "Failed to load share" }, { status: 500 });
  if (!share || (share as any).revoked_at) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const workspaceId = (share as any).workspace_id as string;
  const nowIso = new Date().toISOString();

  // Best-effort: increment views
  try {
    await supabaseAdmin
      .from("workspace_proof_shares")
      .update({ last_viewed_at: nowIso } as any)
      .eq("token", token);
    // We can't safely do atomic increment without SQL function; do a read-modify-write.
    const { data: cur } = await supabaseAdmin
      .from("workspace_proof_shares")
      .select("view_count")
      .eq("token", token)
      .maybeSingle();
    const nextCount = (cur as any)?.view_count ? Number((cur as any).view_count) + 1 : 1;
    await supabaseAdmin
      .from("workspace_proof_shares")
      .update({ view_count: nextCount, last_viewed_at: nowIso } as any)
      .eq("token", token);
  } catch {
    // ignore
  }

  // Preferred: recompute proof stack (max-so-far).
  try {
    const { data } = await supabaseAdmin.rpc("ss_moat_recompute", { p_workspace_id: workspaceId } as any);
    if (data) {
      const d: any = data;
      return NextResponse.json({
        as_of: d.as_of ?? null,
        emails_sent: d.emails_sent ?? 0,
        replies: d.replies ?? 0,
        jobs_booked: d.jobs_booked ?? 0,
        estimated_value: d.estimated_value ?? 0,
        jobs_closed: d.jobs_closed ?? 0,
        revenue_closed: d.revenue_closed ?? 0,
      });
    }
  } catch {
    // fall through
  }

  // Fallback: stored proof stack row.
  const { data: row, error } = await supabaseAdmin
    .from("ss_moat_proof_stack")
    .select(
      "emails_sent_all_time, replies_all_time, jobs_booked_all_time, estimated_value_all_time, jobs_closed_all_time, revenue_closed_all_time, updated_at"
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Failed to load proof" }, { status: 500 });

  return NextResponse.json({
    as_of: (row as any)?.updated_at ?? null,
    emails_sent: (row as any)?.emails_sent_all_time ?? 0,
    replies: (row as any)?.replies_all_time ?? 0,
    jobs_booked: (row as any)?.jobs_booked_all_time ?? 0,
    estimated_value: (row as any)?.estimated_value_all_time ?? 0,
    jobs_closed: (row as any)?.jobs_closed_all_time ?? 0,
    revenue_closed: (row as any)?.revenue_closed_all_time ?? 0,
  });
}








