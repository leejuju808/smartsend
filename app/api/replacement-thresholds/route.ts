import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

type ThresholdRow = {
  channel: "smartsend" | "ads" | "agency";
  cost: number | null;
  closed_jobs: number;
  cost_per_closed_job: number | null;
  smartsend_outperforming: boolean;
};

function asNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function GET() {
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

    const windowDays = 30;

    const { data: rows, error: rpcError } = await supabase.rpc(
      "ss_get_replacement_thresholds",
      {
        p_workspace_id: workspaceId,
        p_days: windowDays,
      }
    );

    if (rpcError) {
      return NextResponse.json(
        { error: "Failed to compute replacement thresholds", details: rpcError.message },
        { status: 500 }
      );
    }

    const typedRows: ThresholdRow[] = (Array.isArray(rows) ? rows : [])
      .map((r: any) => ({
        channel: r.channel,
        cost: r.cost == null ? null : asNumber(r.cost),
        closed_jobs: asNumber(r.closed_jobs),
        cost_per_closed_job: r.cost_per_closed_job == null ? null : asNumber(r.cost_per_closed_job),
        smartsend_outperforming: !!r.smartsend_outperforming,
      }))
      .filter((r) => r.channel === "smartsend" || r.channel === "ads" || r.channel === "agency");

    // Active continuity test (if any)
    const { data: pauseTest } = await supabase
      .from("channel_pause_tests")
      .select("id, channel_type, started_at, ended_at, is_active")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let continuity: null | {
      channel_type: "ads" | "lead_service" | "agency";
      started_at: string;
      emails_sent: number;
      replies: number;
      smartsend_jobs_closed: number;
    } = null;

    if (pauseTest?.is_active && pauseTest.started_at) {
      const startedAtIso = String(pauseTest.started_at);
      const startedDate = startedAtIso.slice(0, 10);

      const { data: insightRows } = await supabase
        .from("ai_insights_metrics")
        .select("emails_sent, emails_replied")
        .eq("workspace_id", workspaceId)
        .gte("metric_date", startedDate);

      const emailsSent = (insightRows ?? []).reduce(
        (sum: number, r: any) => sum + asNumber(r.emails_sent),
        0
      );
      const replies = (insightRows ?? []).reduce(
        (sum: number, r: any) => sum + asNumber(r.emails_replied),
        0
      );

      // SmartSend closed jobs since test start (approved estimates tagged smartsend)
      const { data: companies } = await supabase
        .from("roofing_companies")
        .select("id")
        .eq("workspace_id", workspaceId);
      const companyIds = (companies ?? []).map((c: any) => c.id).filter(Boolean);

      const { count: closedCount } = await supabase
        .from("estimates")
        .select("id", { count: "exact", head: true })
        .in("company_id", companyIds.length ? companyIds : ["00000000-0000-0000-0000-000000000000"])
        .eq("origin_source", "smartsend")
        .not("approved_at", "is", null)
        .gte("approved_at", startedAtIso);

      continuity = {
        channel_type: pauseTest.channel_type,
        started_at: startedAtIso,
        emails_sent: emailsSent,
        replies,
        smartsend_jobs_closed: closedCount ?? 0,
      };
    }

    return NextResponse.json({
      windowDays,
      rows: typedRows,
      continuity,
    });
  } catch (error: any) {
    console.error("replacement-thresholds GET error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}




