import { NextResponse } from "next/server";
import { getServerSupabase, createServiceClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export const dynamic = "force-dynamic";

function startOfWeekMonday(d: Date) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  // JS: Sunday=0..Saturday=6. We want Monday=0..Sunday=6
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date;
}

function addDays(d: Date, days: number) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

type BaselineJson =
  | {
      ok: true;
      method: string;
      window_weeks: number;
      sample_weeks: number;
      asof_week_start: string;
      homeowners_contacted: { center: number; low: number; high: number };
      replies: { center: number; low: number; high: number };
      jobs_booked: { center: number; low: number; high: number };
    }
  | {
      ok: false;
      reason: string;
      sample_weeks: number;
      min_weeks: number;
      window_weeks: number;
      asof_week_start: string;
    };

export async function GET() {
  try {
    const supabase = await getServerSupabase();
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

    const now = new Date();
    const weekStart = startOfWeekMonday(now);
    const weekEndExclusive = addDays(weekStart, 7);
    const weekProgress = clamp01((now.getTime() - weekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));

    // Best-effort: backfill last 12 weeks so the baseline can lock quickly.
    // (The daily cron will keep this fresh after the initial hit.)
    const admin = createServiceClient();
    for (let i = 0; i < 12; i++) {
      const ws = addDays(weekStart, -7 * i);
      // RPC expects DATE (YYYY-MM-DD)
      // eslint-disable-next-line no-await-in-loop
      await admin
        .rpc("ss_reliability_upsert_weekly_metrics", {
          p_workspace_id: workspaceId,
          p_week_start: ws.toISOString().slice(0, 10),
        })
        .catch(() => null);
    }

    const { data: baselineRaw } = await supabase
      .rpc("ss_reliability_compute_baseline", {
        p_workspace_id: workspaceId,
        p_asof_week_start: weekStart.toISOString().slice(0, 10),
      })
      .catch(() => ({ data: null as any }));

    const baseline = (baselineRaw || { ok: false, reason: "baseline_unavailable" }) as BaselineJson;

    // Current week totals (so far)
    const { data: weekRow } = await supabase
      .from("ss_reliability_weekly_metrics")
      .select("week_start, homeowners_contacted, replies, jobs_booked, computed_at")
      .eq("workspace_id", workspaceId)
      .eq("week_start", weekStart.toISOString().slice(0, 10))
      .maybeSingle();

    const current = {
      homeowners_contacted: Number((weekRow as any)?.homeowners_contacted ?? 0),
      replies: Number((weekRow as any)?.replies ?? 0),
      jobs_booked: Number((weekRow as any)?.jobs_booked ?? 0),
    };

    // Quiet drift detection (UI-only; no alerts). Mirror DB behavior:
    // - Only evaluate after week is at least half complete (prevents Monday panic).
    let driftMessage: string | null = null;
    if (baseline.ok && weekProgress >= 0.5) {
      const lowContacted = Number(baseline.homeowners_contacted.low) * weekProgress;
      const lowReplies = Number(baseline.replies.low) * weekProgress;
      const lowJobs = Number(baseline.jobs_booked.low) * weekProgress;

      const below =
        current.homeowners_contacted < lowContacted || current.replies < lowReplies || current.jobs_booked < lowJobs;

      if (below) {
        // Block 272900: If performance dips after manual interference, label the dip.
        // (No explanation; one line.)
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { count: overrideCount } = await supabase
          .from("ss_owner_overrides")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .is("reverted_at", null)
          .gte("created_at", since);

        driftMessage = (overrideCount ?? 0) > 0 ? "Owner override." : "Activity below normal this week.";
      }
    }

    return NextResponse.json(
      {
        ok: true,
        workspace_id: workspaceId,
        week_start: weekStart.toISOString().slice(0, 10),
        week_end_exclusive: weekEndExclusive.toISOString().slice(0, 10),
        week_progress: Number(weekProgress.toFixed(3)),
        current_week: current,
        baseline,
        drift_message: driftMessage,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error: any) {
    console.error("reliability/normal-range error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}





