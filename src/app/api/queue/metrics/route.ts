import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Status =
  | "queued"
  | "scheduled"
  | "sending"
  | "sent"
  | "failed"
  | "throttled"
  | "paused"
  | "bounced"
  | "replied";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspace_id = searchParams.get("workspace_id");
    const limit = Math.min(Number(searchParams.get("limit") || 50), 200);

    // 1) Status counts
    const { data: countsRaw, error: countsErr } = await supabaseAdmin
      .from("send_queue")
      .select("status, count:id", { count: "exact", head: false })
      .group("status")
      .modify((q: any) => {
        if (workspace_id) q.eq("workspace_id", workspace_id);
      });

    if (countsErr) throw countsErr;
    const countsByStatus: Record<Status, number> = {
      queued: 0,
      scheduled: 0,
      sending: 0,
      sent: 0,
      failed: 0,
      throttled: 0,
      paused: 0,
      bounced: 0,
      replied: 0,
    };
    for (const row of countsRaw as Array<{ status: Status; count: number }>) {
      // @ts-expect-error runtime guard
      if (row.status in countsByStatus) countsByStatus[row.status] = Number(row.count ?? 0);
    }

    // 2) Recent items
    const recentSelect = supabaseAdmin
      .from("send_queue")
      .select(
        "id, workspace_id, campaign_id, lead_id, status, subject, scheduled_at, updated_at, last_error"
      )
      .order("updated_at", { ascending: false })
      .limit(limit);
    const { data: recent, error: recentErr } = workspace_id
      ? await recentSelect.eq("workspace_id", workspace_id)
      : await recentSelect;
    if (recentErr) throw recentErr;

    // 3) Throughput metrics
    const sinceHour = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const sinceDay = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const throughputBase = supabaseAdmin.from("send_queue").select("id", { count: "exact", head: true }).eq("status", "sent");
    const { count: hourCount, error: hourErr } = workspace_id
      ? await throughputBase.gte("updated_at", sinceHour).eq("workspace_id", workspace_id)
      : await throughputBase.gte("updated_at", sinceHour);
    if (hourErr) throw hourErr;

    const throughputBaseDay = supabaseAdmin.from("send_queue").select("id", { count: "exact", head: true }).eq("status", "sent");
    const { count: dayCount, error: dayErr } = workspace_id
      ? await throughputBaseDay.gte("updated_at", sinceDay).eq("workspace_id", workspace_id)
      : await throughputBaseDay.gte("updated_at", sinceDay);
    if (dayErr) throw dayErr;

    return NextResponse.json({
      ok: true,
      counts: countsByStatus,
      recent: recent ?? [],
      throughput: {
        sent_last_hour: hourCount ?? 0,
        sent_last_day: dayCount ?? 0,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed to load metrics" }, { status: 500 });
  }
}


