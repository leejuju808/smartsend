import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

type AttemptRow = { result?: string | null } | null;

const aggregate = (rows: AttemptRow[] = []) => {
  const safeRows = rows.filter(Boolean) as Array<{ result?: string | null }>;
  return {
    ok: safeRows.filter((r) => r.result === "ok").length,
    rate: safeRows.filter((r) => r.result === "rate").length,
    eoauth: safeRows.filter((r) => r.result === "eoauth").length,
    soft: safeRows.filter((r) => r.result === "soft").length,
    hard: safeRows.filter((r) => r.result === "hard").length,
    total: safeRows.length,
  };
};

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const now = new Date();
  const since1h = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [{ count: qQueued }, { count: qWorking }] = await Promise.all([
    supabase.from("send_queue").select("id", { head: true, count: "exact" }).eq("status", "queued"),
    supabase.from("send_queue").select("id", { head: true, count: "exact" }).eq("status", "working"),
  ]);

  const [{ data: hour }, { data: day }] = await Promise.all([
    supabase.from("send_attempts").select("result").gte("created_at", since1h),
    supabase.from("send_attempts").select("result").gte("created_at", since24h),
  ]);

  const { data: th } = await supabase
    .from("inbox_threads")
    .select("account_id")
    .eq("campaign_id", params.id)
    .not("account_id", "is", null)
    .limit(1);

  let budget: {
    account_id: string;
    hourly_used: number;
    hourly_quota: number;
    daily_used: number;
    daily_quota: number;
  } | null = null;

  const accountId = th && th[0]?.account_id;
  if (accountId) {
    const [{ data: hourTicks }, { data: dayTicks }, { data: budgetRow }] = await Promise.all([
      supabase.from("send_usage_ticks").select("attempts, bucket_min").eq("account_id", accountId).gte("bucket_min", since1h),
      supabase.from("send_usage_ticks").select("attempts, bucket_min").eq("account_id", accountId).gte("bucket_min", since24h),
      supabase.from("send_rate_budgets").select("*").eq("account_id", accountId).maybeSingle(),
    ]);

    const usedHour = (hourTicks ?? []).reduce((sum, x) => sum + (x.attempts ?? 0), 0);
    const usedDay = (dayTicks ?? []).reduce((sum, x) => sum + (x.attempts ?? 0), 0);

    budget = {
      account_id: accountId,
      hourly_used: usedHour,
      hourly_quota: budgetRow?.hourly_quota ?? 200,
      daily_used: usedDay,
      daily_quota: budgetRow?.daily_quota ?? 1800,
    };
  }

  return NextResponse.json({
    queue: { queued: qQueued ?? 0, working: qWorking ?? 0 },
    last_hour: aggregate(hour ?? []),
    last_24h: aggregate(day ?? []),
    budget,
  });
}


