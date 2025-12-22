// Throttle state for sender accounts
export async function getThrottleState(supabase: any, accountId: string) {
  // fetch account config
  const { data: acct } = await supabase
    .from("sender_accounts")
    .select("id, hourly_cap, daily_cap, min_gap_seconds, warmup_enabled, warmup_start, warmup_initial_daily, warmup_increment, warmup_max_daily")
    .eq("id", accountId)
    .single()

  if (!acct) return null

  // counters
  const now = new Date()
  const hourBucket = new Date(now); hourBucket.setMinutes(0,0,0)
  const dayBucket = new Date(now); dayBucket.setHours(0,0,0,0)

  const { data: counts } = await supabase
    .from("send_counters")
    .select("period, bucket, count")
    .in("period", ["hour","day"])
    .in("bucket", [hourBucket.toISOString(), dayBucket.toISOString()])
    .eq("account_id", accountId)

  const hourCount = counts?.find(c => c.period === "hour")?.count ?? 0
  const dayCount  = counts?.find(c => c.period === "day")?.count ?? 0

  // warm-up daily cap (clamped)
  const { data: capRows } = await supabase.rpc("sender_today_cap", { account: accountId })
  const warmupDailyCap = Array.isArray(capRows) ? capRows[0] : capRows

  // last send timestamp for min_gap_seconds
  const { data: lastLog } = await supabase
    .from("campaign_logs")
    .select("created_at")
    .eq("sender_account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const lastTs = lastLog?.created_at ? new Date(lastLog.created_at).getTime() : 0

  return {
    acct,
    hourCount, dayCount, warmupDailyCap,
    lastSentAtMs: lastTs
  }
}

export function computeDeferral(
  nowMs: number,
  hourCount: number,
  dayCount: number,
  acct: any,
  warmupDailyCap: number,
  lastSentAtMs: number
) {
  const reasons: string[] = []
  let nextAt = nowMs

  // Hourly cap
  if (hourCount >= acct.hourly_cap) {
    // defer to the start of next hour + a small jitter
    const nextHour = new Date(nowMs); nextHour.setMinutes(60, 5, 0)
    reasons.push("hourly cap")
    nextAt = Math.max(nextAt, nextHour.getTime())
  }

  // Daily cap (using warm-up adjusted cap)
  const effectiveDailyCap = Math.min(acct.daily_cap, warmupDailyCap)
  if (dayCount >= effectiveDailyCap) {
    // defer to tomorrow 08:00 local server time
    const tmr = new Date(nowMs); tmr.setDate(tmr.getDate() + 1); tmr.setHours(8,0,0,0)
    reasons.push(`daily cap (${effectiveDailyCap})`)
    nextAt = Math.max(nextAt, tmr.getTime())
  }

  // Pacing gap
  if (lastSentAtMs > 0) {
    const nextGap = lastSentAtMs + (acct.min_gap_seconds * 1000)
    if (nextGap > nowMs) {
      reasons.push("min gap")
      nextAt = Math.max(nextAt, nextGap)
    }
  }

  return { shouldDefer: reasons.length > 0, nextAt, reasons }
}

export async function deferJob(supabase: any, jobId: string, runAtMs: number, reasons: string[], workerId: string) {
  const runAtIso = new Date(runAtMs).toISOString()
  await supabase.from("email_jobs").update({
    status: "queued",
    scheduled_at: runAtIso,
    last_error: `deferred: ${reasons.join(", ")}`,
    locked_by: null,
    locked_at: null
  }).eq("id", jobId).eq("locked_by", workerId)
} 